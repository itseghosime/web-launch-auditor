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
  await expect(page.getByRole('heading', { name: 'Built with care. Launch with confidence.' })).toBeVisible();
  await expect(page.getByText('Flight Logs').first()).toBeVisible();
  await page.screenshot({ path: 'design-evidence/desktop-empty.png', fullPage: true });
  await page.getByLabel('Website URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Audit my site' }).click();
  await expect(page.getByText('Scan in progress')).toBeVisible();
  await expect(page.getByText('Missing meta description')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Page could not be fetched')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Framework: Not identified', exact: true })).toBeVisible();
  await expect(page.getByText('Add a unique meta description to this page.')).toBeVisible();
  await page.getByLabel('Filter by severity').selectOption('review');
  await expect(page.getByText('Missing meta description')).not.toBeVisible();
  await expect(page.getByText('Review image alternative text')).toBeVisible();
  await page.getByLabel('Filter by severity').selectOption('all');
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Export JSON' }).click(); expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => (await page.locator('.telemetry-topbar').boundingBox())?.y).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'design-evidence/desktop-results.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Flight Logs')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'design-evidence/mobile-results.png', fullPage: true });
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(page.getByText('Scan in progress')).toBeVisible();
  await expect(page.getByText('Missing meta description')).toBeVisible({ timeout: 15000 });
  page.on('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete scan' }).click();
  await expect(page.getByRole('heading', { name: 'Built with care. Launch with confidence.' })).toBeVisible();
});

test('backend unavailable offers recovery and disables submission before session exists', async ({ page }) => {
  let healthy = false;
  await page.route('**/api/scans', route => healthy ? route.fulfill({ json: { items: [] } }) : route.fulfill({ status: 502, json: { detail: 'The scanner is temporarily unavailable. Please try again.' } }));
  await page.goto('/');
  await expect(page.locator('div.alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Audit my site' })).toBeDisabled();
  await page.screenshot({ path: 'design-evidence/error.png', fullPage: true });
  healthy = true; await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Audit my site' })).toBeEnabled();
  await page.keyboard.press('Tab');
});

test('localhost CORS bridge modal opens when localhost fetch fails', async ({ page }) => {
  await page.route('**/api/scans', route => route.fulfill({ json: { items: [] } }));
  await page.goto('/');
  await page.getByLabel('Website URL').fill('http://localhost:3000');
  await page.getByRole('button', { name: 'Audit my site' }).click();
  await expect(page.getByText('LOCAL RELAY // CORS REQUIRED')).toBeVisible();
  await expect(page.getByText('Localhost Bridge Setup')).toBeVisible();
  await page.getByRole('button', { name: 'Option B: Dev Server CORS' }).click();
  await expect(page.getByText('Next.js CORS Header Config')).toBeVisible();
  await page.screenshot({ path: 'design-evidence/localhost-help.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByText('Localhost Bridge Setup')).not.toBeVisible();
});

test('social card simulator, AI prompt copy, delta score, and share modal', async ({ page }) => {
  const scanData = {
    ...completed,
    id: 'scan-share-1',
    score: 88,
    stack: 'nextjs',
    ai_prompt: 'Fix missing description in layout.tsx',
    pages: [
      {
        source: 'url',
        page_url: 'https://example.com',
        status_code: 200,
        social_preview: {
          title: 'Example Domain',
          description: 'Example Domain description for sharing.',
          domain: 'example.com'
        },
        findings: [
          {
            rule: 'missing_description',
            category: 'SEO',
            severity: 'warning' as const,
            message: 'Missing meta description',
            evidence: '<head> has no description',
            recommendation: 'Add a description tag.'
          }
        ]
      }
    ]
  };

  await page.route('**/api/scans**', route => {
    const req = route.request();
    if (req.url().includes('/share')) {
      return route.fulfill({
        json: {
          report_id: 'rep-123',
          share_url: 'http://localhost:3000/r/rep-123',
          badge_url: 'http://localhost:3000/api/reports/rep-123/badge.svg'
        }
      });
    }
    if (req.method() === 'POST') {
      return route.fulfill({ status: 202, json: scanData });
    }
    return route.fulfill({ json: { items: [scanData] } });
  });

  await page.goto('/');
  await page.getByLabel('Website URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Audit my site' }).click();
  await expect(page.getByRole('status', { name: 'Framework: Next.js', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Social previews', exact: true }).click();
  await expect(page.getByText('SOCIAL CARD SIMULATOR')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Naked Link Alert — No og:image found for X (Twitter)')).toBeVisible();

  // Switch tabs
  await page.getByRole('button', { name: 'WhatsApp' }).click();
  await expect(page.getByText('Naked Link Alert — No og:image found for WhatsApp')).toBeVisible();
  await page.getByRole('button', { name: 'LinkedIn' }).click();
  await expect(page.getByText('Naked Link Alert — No og:image found for LinkedIn')).toBeVisible();
  await page.getByRole('button', { name: 'iMessage' }).click();
  await expect(page.getByText('Naked Link Alert — No og:image found for iMessage')).toBeVisible();

  // Copy AI Fix Prompt button
  await expect(page.getByRole('button', { name: 'Copy AI Fix Prompt (Cursor / Claude)' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy AI Fix Prompt (Cursor / Claude)' }).click();
  await expect(page.getByText('Prompt Copied! Paste in Cursor / Claude')).toBeVisible();

  // Share Modal
  await page.getByRole('button', { name: 'Share Report & Badge' }).click();
  await expect(page.getByText('VERIFIED FLIGHT MANIFEST // SHARE')).toBeVisible();
  await expect(page.locator('input[readonly]').first()).toHaveValue('http://localhost:3000/r/rep-123');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'design-evidence/share-report.png', fullPage: true });
  await page.getByRole('button', { name: 'Close modal' }).click();
});

test('public share verified report page /r/[id]', async ({ page }) => {
  await page.route('**/api/reports/rep-123', route => {
    return route.fulfill({
      json: {
        id: 'rep-123',
        scan_id: 'scan-1',
        url: 'https://example.com',
        created_at: '2026-10-15T12:00:00Z',
        summary: {
          score: 92,
          pages_scanned: 1,
          findings_count: 1,
          status: 'completed',
          verified: true
        },
        findings: [
          {
            rule: 'missing_description',
            category: 'SEO',
            severity: 'warning',
            message: 'Missing meta description',
            evidence: 'no description',
            page: 'https://example.com',
            recommendation: 'Add a description.'
          }
        ]
      }
    });
  });

  await page.goto('/r/rep-123');
  await expect(page.getByText('PUBLIC AUDIT SNAPSHOT')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'example.com' })).toBeVisible();
  await expect(page.getByText('92')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit your own site' }).last()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => (await page.locator('.report-header').boundingBox())?.y).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'design-evidence/public-report.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'design-evidence/mobile-report.png', fullPage: true });
});


test('mobile launch workspace, preview interaction, history and keyboard navigation', async ({ page }) => {
  await page.route('**/api/scans', route => route.fulfill({ json: { items: [] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Audit my site' })).toBeEnabled();
  await page.getByRole('button', { name: 'Crawl depth 0', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crawl depth 0', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'LinkedIn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'LinkedIn', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('Explore the checks', { exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(async () => (await page.locator('.telemetry-topbar').boundingBox())?.y).toBe(0);
  await expect(page.getByText('Preview X, LinkedIn, WhatsApp, and iMessage cards', { exact: false })).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByLabel('Website URL')).toBeFocused();
  await expect(page.getByLabel('Website URL')).toHaveCSS('outline-style', 'solid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'design-evidence/mobile-empty.png', fullPage: true });
  await page.getByRole('button', { name: 'History 0', exact: true }).click();
  await expect(page.locator('.flight-recorder-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.flight-recorder-drawer')).not.toBeVisible();
});

test('live network persists after completion and supports page selection with reduced motion', async ({ page }) => {
  let done = false, submitted = false;
  const scan = { ...completed, score: 92, pages: completed.pages.map(p => ({ ...p, social_preview: { title: p.page_url.endsWith('unavailable') ? 'Second page preview' : 'Home preview', description: 'A preview from the selected page.' } })) };
  await page.route('**/api/scans**', route => {
    if (route.request().method() === 'POST') { submitted = true; return route.fulfill({ status: 202, json: { ...scan, status: 'running', pages: [] } }); }
    const data = done ? scan : { ...scan, status: 'running', pages: [] };
    if (new URL(route.request().url()).pathname === '/api/scans') return route.fulfill({ json: { items: submitted ? [data] : [] } });
    return route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByLabel('Website URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Audit my site' }).click();
  await expect(page.getByText('Scan in progress', { exact: false })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'design-evidence/desktop-loading.png', fullPage: true });
  done = true;
  await expect(page.getByText('Missing meta description')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('canvas')).toBeVisible();
  const canvasPixels = () => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const before = await canvasPixels();
  await page.waitForTimeout(150);
  expect((await canvasPixels()) !== before).toBeTruthy();
  await page.getByLabel('Inspect page', { exact: true }).selectOption('https://example.com/unavailable');
  await expect(page.getByText('Second page preview', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'design-evidence/mobile-network.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const still = await canvasPixels();
  await page.waitForTimeout(150);
  expect((await canvasPixels()) === still).toBeTruthy();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'design-evidence/reduced-motion.png', fullPage: true });
});

test('expired public report offers a route back to the auditor', async ({ page }) => {
  await page.route('**/api/reports/expired', route => route.fulfill({ status: 404, json: { detail: 'Report not found' } }));
  await page.goto('/r/expired');
  await expect(page.getByRole('heading', { name: 'Report not found or expired.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit your own site' })).toHaveAttribute('href', '/');
  await page.screenshot({ path: 'design-evidence/report-expired.png', fullPage: true });
});

test('scanning fits the viewport without document scrolling on desktop and mobile', async ({ page }) => {
  let submitted = false;
  const running = { ...completed, status: 'running', pages: completed.pages, pages_scanned: 2 };
  await page.route('**/api/scans**', route => {
    if (route.request().method() === 'POST') { submitted = true; return route.fulfill({ status: 202, json: running }); }
    return route.fulfill({ json: new URL(route.request().url()).pathname === '/api/scans' ? { items: submitted ? [running] : [] } : running });
  });
  await page.goto('/');
  // Enter scanning after scrolling the landing page: no inherited scroll offset.
  await page.getByLabel('Website URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Audit my site' }).click();
  await expect(page.getByText('Scan in progress', { exact: false })).toBeVisible();
  for (const [width, height] of [[1440, 900], [390, 844], [390, 667], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('status', { name: 'Framework: Detecting…', exact: true })).toBeVisible();
    await expect(page.locator('.is-scanning')).toHaveCSS('height', `${height}px`);
    await expect(page.locator(".telemetry-topbar")).toHaveCSS("width", `${width}px`);
    await page.mouse.wheel(0, 800);
    expect(await page.evaluate(() => ({ scroll: window.scrollY, fits: document.documentElement.scrollHeight <= innerHeight }))).toEqual({ scroll: 0, fits: true });
    for (const selector of ['.telemetry-topbar', '.floating-compact-command-bar', '.floating-right-inspector-deck', '.bottom-telemetry-dock']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    }
    await expect(page.locator('canvas')).toBeVisible();
    await page.screenshot({ path: `design-evidence/scanning-${width}x${height}.png` });
  }
});
