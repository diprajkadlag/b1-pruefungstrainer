import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * The service worker and the files it must leave alone.
 *
 * The app shell is precached and served for any navigation it does not
 * recognise, which is what makes a reload work offline. But a click on a PDF,
 * an <object> embedding one and a new tab opening one are all navigations
 * too, and for a while the worker answered every one of them with the start
 * screen — the address bar said loesungen.pdf and the page said "Welches
 * Niveau?". These tests go through the worker on purpose, which is why they
 * navigate rather than fetch: a fetch never hits the navigation fallback and
 * would have passed all along.
 */

const registry = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../public/content/index.json', import.meta.url)),
    'utf-8',
  ),
) as {
  pruefungen: { id: string; pdfsVorAbgabe: string[]; pdfsNachAbgabe: string[] }[];
  stufenPdfs?: Record<string, string[]>;
};

/** Load the app once so the worker installs and takes control of the page. */
async function unterKontrolle(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // clientsClaim is on, but the first page can still be uncontrolled for a
  // tick; one reload settles it either way.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/**
 * Navigate to a PDF and report what came back. Headless Chromium turns a PDF
 * navigation into a download rather than a page, so either outcome counts —
 * what must never happen is an HTML document.
 */
async function pdfAnsteuern(page: Page, url: string) {
  const download = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  let typ: string | null = null;
  try {
    const antwort = await page.goto(url);
    typ = antwort?.headers()['content-type'] ?? null;
  } catch {
    // "Download is starting" — Chromium refused to show it as a page.
  }
  const d = await download;
  return { download: d !== null, typ };
}

test.describe('Dateien unter /content/ gehen am App-Shell vorbei', () => {
  test('ein Lösungsheft-Link liefert das PDF, nicht die Startseite', async ({ page }) => {
    const mitLoesung = registry.pruefungen.find((p) => p.pdfsNachAbgabe.length > 0);
    test.skip(!mitLoesung, 'no PDFs were built for this checkout');
    await unterKontrolle(page);

    const { download, typ } = await pdfAnsteuern(
      page,
      `/content/${mitLoesung!.id}/pdf/loesungen.pdf`,
    );
    expect(download || (typ ?? '').includes('pdf')).toBe(true);
    expect(typ ?? '').not.toContain('text/html');
  });

  test('ein Spickzettel der Stufe ebenso', async ({ page }) => {
    const stufe = Object.keys(registry.stufenPdfs ?? {})[0];
    test.skip(!stufe, 'no level PDFs were built for this checkout');
    await unterKontrolle(page);

    const { download, typ } = await pdfAnsteuern(
      page,
      `/content/pdf/spickzettel-${stufe!.toLowerCase()}.pdf`,
    );
    expect(download || (typ ?? '').includes('pdf')).toBe(true);
    expect(typ ?? '').not.toContain('text/html');
  });

  test('eine unbekannte App-Route bekommt weiterhin die Shell', async ({ page }) => {
    // The fallback is what makes an offline reload work; the denylist must
    // not have thrown it out along with the PDFs.
    await unterKontrolle(page);
    const antwort = await page.goto('/irgendwo/tief/in/der/app');
    expect(antwort?.headers()['content-type'] ?? '').toContain('text/html');
    await expect(page.getByText('GermanExamTrainer').first()).toBeVisible();
  });
});
