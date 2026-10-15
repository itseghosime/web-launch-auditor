import { expect, test } from '@playwright/test';
const completed = { id: 'scan-123', url: 'https://example.com', status: 'completed', created_at: '2026-10-15T12:00:00Z', updated_at: '2026-10-15T12:00:01Z', max_pages: 5, max_depth: 1, pages_scanned: 2, findings_count: 2, stop_reason: 'page_limit', pages: [{ source: 'url', page_url: 'https://example.com', status_code: 200, findings: [{ rule: 'missing_description', category: 'SEO', severity: 'warning', message: 'Missing meta description', evidence: '<head> has no description', recommendation: 'Add a unique meta description to this page.' }, { rule: 'image_alt', category: 'Accessibility', severity: 'review', message: 'Review image alternative text', evidence: 'image.jpg', recommendation: 'Describe the purpose of this image.' }] }, { source: 'url', page_url: 'https://example.com/unavailable', status_code: null, error: 'Page could not be fetched', findings: [] }] };

test('scan lifecycle, filters, export, retry, deletion and responsive layout', async ({ page }) => {
  let scans: typeof completed[] = [], polls = 0;
  await page.route('**/api/scans**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') { expect(request.postDataJSON()).toEqual({ url: 'https://example.com', max_pages: 5, max_depth: 1 }); scans = [{ ...completed, status: 'running', pages: [], pages_scanned: 0, findings_count: 0 }]; polls = 0; return route.fulfill({ status: 202, json: scans[0] }); }
    if (request.method() === 'DELETE') { scans = []; return route.fulfill({ status: 204 }); }
    if (path.endsWith('/export')) return route.fulfill({ json: completed, headers: { 'Content-Disposition': 'attachment; filename="scan.json"' } });
    if (path === '/api/scans') { if (scans.length && ++polls >= 2) scans = [completed]; return route.fulfill({ json: { items: scans } }); }
    return route.fulfill({ json: scans[0] || completed });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No scans yet' })).toBeVisible();
  await page.screenshot({ path: 'design-evidence/desktop-empty.png', fullPage: true });
  await page.getByLabel('Website URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Ignite Scan' }).click();
  await expect(page.getByText('Scan in progress')).toBeVisible();
  await expect(page.getByText('Missing meta description')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Page could not be fetched')).toBeVisible();
  await page.getByText('Missing meta description').click();
  await expect(page.getByText('Add a unique meta description to this page.')).toBeVisible();
  await page.getByLabel('Filter by severity').selectOption('review');
  await expect(page.getByText('Missing meta description')).not.toBeVisible();
  await expect(page.getByText('Review image alternative text')).toBeVisible();
  await page.getByLabel('Filter by severity').selectOption('all');
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Export JSON' }).click(); expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.screenshot({ path: 'design-evidence/desktop-results.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Ignite Scan' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'design-evidence/mobile-results.png', fullPage: true });
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(page.getByText('Scan in progress')).toBeVisible();
  await expect(page.getByText('Missing meta description')).toBeVisible({ timeout: 15000 });
  page.on('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete scan' }).click();
  await expect(page.getByRole('heading', { name: 'No scans yet' })).toBeVisible();
});

test('backend unavailable offers recovery and disables submission before session exists', async ({ page }) => {
  let healthy = false;
  await page.route('**/api/scans', route => healthy ? route.fulfill({ json: { items: [] } }) : route.fulfill({ status: 502, json: { detail: 'The scanner is temporarily unavailable. Please try again.' } }));
  await page.goto('/');
  await expect(page.locator('div.alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Ignite Scan' })).toBeDisabled();
  await page.screenshot({ path: 'design-evidence/error.png', fullPage: true });
  healthy = true; await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Ignite Scan' })).toBeEnabled();
  await page.keyboard.press('Tab');
});
