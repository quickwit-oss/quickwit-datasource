import { test, expect } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';

// Grafana (inside Docker) reaches Quickwit via the docker service name.
// The test process (on the host) reaches the same Quickwit via localhost port mapping.
const QUICKWIT_URL = 'http://quickwit:7280/api/v1';
const QUICKWIT_INGEST_URL = 'http://localhost:7280/api/v1';
const INDEX = 'otel-logs-v0_9';

let runId: string;
let ingestDone: Promise<void>;

test.beforeEach(async () => {
  runId = `e2e-${Date.now()}`;
  ingestDone = ingestDummyLogs(runId);
});

test.afterEach(async () => {
  await fetch(`${QUICKWIT_INGEST_URL}/indexes/${INDEX}/clear`, { method: 'PUT' }).catch(() => {});
});

test('create datasource and explore logs', async ({ page }) => {
  let datasourceUid: string;
  const quickwitDatasourceButton = page.locator('button').filter({ hasText: /^Quickwit$/ }).first();

  await test.step('look for the plugin in the list of datasources', async () => {
    await page.goto('/connections/datasources/new');
    await dismissWhatsNewModal(page);
    await page.getByPlaceholder('Filter by name or type').fill('quickwit');
    await expect(quickwitDatasourceButton).toBeVisible();
  });

  await test.step('create datasource via UI', async () => {
    await page.goto('/connections/datasources/new');
    await dismissWhatsNewModal(page);
    await page.getByPlaceholder('Filter by name or type').fill('quickwit');
    // Grafana 13 sometimes leaves a portal overlay mounted above the picker.
    // Force the click once the correct button is resolved.
    await quickwitDatasourceButton.click({ force: true });

    // Wait for the config form to load
    await expect(page.getByText('Index settings')).toBeVisible();

    // Fill required fields
    await page.getByRole('textbox', { name: /URL/ }).fill(QUICKWIT_URL);
    await page.getByRole('textbox', { name: 'Index ID' }).fill(INDEX);

    // Save & test
    await page.getByRole('button', { name: 'Save & test' }).click();
    await expect(page.getByText('plugin is running')).toBeVisible();

    // Extract datasource UID from URL for cleanup
    const url = page.url();
    const match = url.match(/\/datasources\/edit\/([^/]+)/);
    expect(match).toBeDefined();
    datasourceUid = match?.[1] ?? '';
  });

  await test.step('wait for quickwit logs to be ingested', async () => {
    await ingestDone;
  });

  await test.step('explore logs returns hits', async () => {
    // Navigate to explore from the datasource config page
    await page.goto(`/connections/datasources/edit/${datasourceUid}`);
    await page.getByRole('link', { name: 'Explore data' }).click();

    await expect(page.getByText(`log-1-${runId}`).first()).toBeVisible();
    await expect(page.getByText(`log-2-${runId}`).first()).toBeVisible();
  });
});

/**
 * call quickwit ingest API to ingest dummy logs
 */
async function ingestDummyLogs(runId: string) {
  const now = Date.now() * 1_000_000; // nanoseconds
  const ndjson = [
    {
      timestamp_nanos: now,
      service_name: runId,
      severity_text: 'INFO',
      body: { message: `log-1-${runId}` },
    },
    {
      timestamp_nanos: now - 1_000_000_000,
      service_name: runId,
      severity_text: 'WARN',
      body: { message: `log-2-${runId}` },
    },
  ]
    .map((l) => JSON.stringify(l))
    .join('\n');

  const res = await fetch(`${QUICKWIT_INGEST_URL}/${INDEX}/ingest?commit=wait_for`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: ndjson,
  });
  if (!res.ok) {
    throw new Error(`Ingest failed: ${res.status} ${await res.text()}`);
  }

  // Verify logs are indexed and searchable
  const search = await fetch(`${QUICKWIT_INGEST_URL}/${INDEX}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `service_name:${runId}` }),
  });
  const { num_hits } = await search.json();
  if (num_hits === 0) {
    throw new Error('Ingest failed: no searchable logs');
  }
}

async function dismissWhatsNewModal(page: Page) {
  const dialog = page.getByRole('dialog', { name: "What's new in Grafana" });
  const closeButton = dialog.getByRole('button', { name: 'Close' });

  await closeButton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

  if (await dialog.isVisible().catch(() => false)) {
    await closeButton.click({ force: true });
    await expect(dialog).toBeHidden({ timeout: 10000 });
  }
}
