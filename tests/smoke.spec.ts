import { test, expect } from '@grafana/plugin-e2e';

test('Grafana home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Grafana/);
});
