import { test, expect } from '@grafana/plugin-e2e';

test('smoke test - home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome to Grafana/i })).toBeVisible();
});
