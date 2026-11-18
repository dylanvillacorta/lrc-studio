import { expect, test } from '@playwright/test';

test.describe('SEO, metadatos y endpoints estáticos', () => {
  test('cumple meta etiquetas SEO, JSON-LD, manifest, robots, sitemap y version.json', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('h1')).toHaveCount(1);

    const titles = page.locator('head title');
    await expect(titles).toHaveCount(1);
    expect((await titles.first().textContent())?.trim().length).toBeGreaterThan(10);

    const descriptions = page.locator('meta[name="description"]');
    await expect(descriptions).toHaveCount(1);
    expect(
      (await descriptions.first().getAttribute('content'))?.trim().length,
    ).toBeGreaterThan(20);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://lrc.dirtykeras.com/',
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#E6E2DC',
    );

    // Open Graph y Twitter Card
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      'https://lrc.dirtykeras.com/',
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://lrc.dirtykeras.com/og-image.png',
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute(
      'content',
      /.+/,
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      'https://lrc.dirtykeras.com/og-image.png',
    );

    // JSON-LD SoftwareApplication válido
    const ldJsonRaw = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ldJsonRaw).toBeTruthy();
    const ldJson = JSON.parse(ldJsonRaw ?? '{}') as Record<string, unknown>;
    expect(ldJson['@type']).toBe('SoftwareApplication');
    expect(ldJson['name']).toBe('LyricSync Studio');
    expect(ldJson['inLanguage']).toBe('es');

    // <noscript> presente
    const noscript = page.locator('noscript');
    await expect(noscript).toHaveCount(1);
    expect(await noscript.innerHTML()).toContain('LyricSync Studio');

    // Manifest enlazado y accesible
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.webmanifest');
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = (await manifestRes.json()) as {
      name?: string;
      icons?: unknown[];
    };
    expect(manifestJson.name).toBe('LyricSync Studio');
    expect(Array.isArray(manifestJson.icons) && manifestJson.icons.length).toBeGreaterThan(0);

    // robots.txt y sitemap.xml
    const robotsRes = await request.get('/robots.txt');
    expect(robotsRes.status()).toBe(200);
    const robotsTxt = await robotsRes.text();
    expect(robotsTxt).toContain('https://lrc.dirtykeras.com/sitemap.xml');

    const sitemapRes = await request.get('/sitemap.xml');
    expect(sitemapRes.status()).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain('https://lrc.dirtykeras.com/');

    // version.json
    const versionRes = await request.get('/version.json');
    expect(versionRes.status()).toBe(200);
    const versionJson = (await versionRes.json()) as {
      version?: string;
      commit?: string;
      builtAt?: string;
    };
    expect(typeof versionJson.version).toBe('string');
    expect(typeof versionJson.commit).toBe('string');
    expect(typeof versionJson.builtAt).toBe('string');
    expect(Number.isNaN(Date.parse(versionJson.builtAt ?? ''))).toBe(false);
  });
});
