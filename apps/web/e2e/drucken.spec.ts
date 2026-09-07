import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { oeffnen } from './hilfe';

/**
 * End-to-end: the printable papers.
 *
 * The printables now live behind the second question at the front door.
 * "Auf Papier" opens a shelf with every heft of the chosen level — the level's
 * own Lernmaterial first, then one fold per paper — while "Am Bildschirm" is
 * the timed attempt and offers no printables at all until it is over.
 *
 * Two things matter. The links must actually resolve: a 404 behind a download
 * button is worse than no button. And on the screen path the solution booklet
 * must obey the same rule as the JSON answer key — not offered until the
 * attempt closes. On the paper shelf it is offered openly under its own
 * warning, which is not a leak: someone printing the sheets has no attempt in
 * progress to protect.
 */

const registry = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../apps/web/public/content/index.json', import.meta.url),
    ),
    'utf-8',
  ),
);

const exam = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../content/exams/pruefung-01/exam.json', import.meta.url),
    ),
    'utf-8',
  ),
);

type Eintrag = {
  id: string;
  titel: string;
  stufe: string;
  pdfsVorAbgabe: string[];
  pdfsNachAbgabe: string[];
};

// The shelf shows one level at a time, so everything here is measured against
// the B1 papers rather than against whatever happens to sort first in the
// registry — that is an A1 paper, and A1 is a different shelf.
const b1: Eintrag[] = registry.pruefungen.filter((p: Eintrag) => p.stufe === 'B1');
const erste = b1[0];
const stufenPdfs: string[] = registry.stufenPdfs?.B1 ?? [];
const hatPdfs: boolean = erste.pdfsVorAbgabe.length > 0;

type Item = { nr: number; loesung: string; typ: string };
const lesenItems: Item[] = exam.lesen.teile.flatMap((t: { items: Item[] }) => t.items);

/** One paper's fold on the paper shelf, unfolded. */
async function heftOeffnen(page: Page, titel: string): Promise<Locator> {
  const heft = page.locator('.papier__pruefung').filter({ hasText: titel });
  await heft.locator('summary').click();
  return heft;
}

const hrefs = (links: Locator): Promise<string[]> =>
  links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));

async function pruefungAblegen(page: Page) {
  await oeffnen(page, 'B1');
  await page.getByRole('button', { name: /Übungsprüfung 1/ }).click();
  for (const label of ['Hören', 'Schreiben', 'Sprechen']) {
    const box = page.getByRole('checkbox', { name: new RegExp(label) });
    if (await box.isChecked()) await box.click();
  }
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
  for (const item of lesenItems) {
    await page
      .locator(`input[name="item-${item.nr}"][value="${item.loesung}"]`)
      .check({ force: true });
  }
  await page.getByRole('button', { name: /Auswertung ansehen/ }).click();
  await page.locator('.karte').first().waitFor();
}

test.skip(!hatPdfs, 'PDFs were not built for this export — run npm run content:pdf');

test('offers the papers for printing, without starting an exam', async ({ page }) => {
  await oeffnen(page, 'B1', 'offline');
  await page.getByRole('heading', { name: 'Zum Lesen und Ausdrucken' }).waitFor();

  const heft = await heftOeffnen(page, erste.titel);
  for (const name of ['Kandidatenblätter', 'Antwortbogen', 'Sprechen-Karten']) {
    await expect(heft.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(heft.getByRole('link', { name: 'Herunterladen' })).toHaveCount(
    erste.pdfsVorAbgabe.length + erste.pdfsNachAbgabe.length,
  );

  // Paper is a shelf, not a back door into the timed attempt.
  await expect(page.getByRole('button', { name: /Prüfung starten/ })).toHaveCount(0);
});

test('the print links resolve to a real PDF', async ({ page, request }) => {
  await oeffnen(page, 'B1', 'offline');

  // The level's own booklets sit above the papers — one shelf carries both.
  const lernblaetter = page
    .locator('section.teil')
    .filter({ has: page.getByRole('heading', { name: 'Lernmaterial' }) })
    .locator('a[download]');

  const heft = await heftOeffnen(page, erste.titel);
  const blaetter = heft.locator('.papier__liste').first().locator('a[download]');

  // toHaveCount, not count(): the shelf only renders once the registry fetch
  // resolves, and a bare count() reads whatever is there at that instant.
  await expect(lernblaetter).toHaveCount(stufenPdfs.length);
  await expect(blaetter).toHaveCount(erste.pdfsVorAbgabe.length);

  for (const href of [...(await hrefs(lernblaetter)), ...(await hrefs(blaetter))]) {
    const res = await request.get(href);
    expect(res.status(), `${href} should exist`).toBe(200);
    // A PDF, not an SPA fallback page dressed up as one.
    expect(res.headers()['content-type']).toContain('pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
});

test('each paper carries only its own sheets', async ({ page }) => {
  test.skip(b1.length < 2, 'needs at least two B1 papers');
  // No paper is "selected" any more: the shelf lists all of them, each folded
  // up with its own sheets inside. What used to be "switching the paper
  // switches which PDFs are offered" is now "every fold offers that paper's
  // files and nobody else's".
  await oeffnen(page, 'B1', 'offline');

  for (const p of b1.slice(0, 2)) {
    const heft = await heftOeffnen(page, p.titel);
    const links = heft.locator('a[download]');
    await expect(links).toHaveCount(p.pdfsVorAbgabe.length + p.pdfsNachAbgabe.length);
    for (const href of await hrefs(links)) {
      // The leading slash matters: without it "pruefung-01" would also match
      // the A1 and B2 papers whose ids end in the same digits.
      expect(href, `${p.id} should link only its own files`).toContain(`/${p.id}/pdf/`);
    }
  }
});

test('never offers the solution booklet before submission', async ({ page }) => {
  await oeffnen(page, 'B1');
  await page.getByRole('heading', { name: 'Prüfung ablegen' }).waitFor();

  // Not on the screen shelf, and not fetched while the exam is open.
  await expect(page.getByRole('link', { name: /Lösungsheft/ })).toHaveCount(0);
  expect(await page.content()).not.toContain('loesungen.pdf');

  const geladen: string[] = [];
  page.on('response', (r) => geladen.push(r.url()));

  await page.getByRole('button', { name: /Übungsprüfung 1/ }).click();
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
  await page.locator('input[name="item-1"]').first().waitFor();

  await expect(page.getByRole('link', { name: /Lösungsheft/ })).toHaveCount(0);
  expect(geladen.some((u) => u.includes('loesungen.pdf'))).toBe(false);
});

test('offers the solution booklet once the attempt is closed', async ({
  page,
  request,
}) => {
  test.skip(erste.pdfsNachAbgabe.length === 0, 'no solution booklet in this export');
  await pruefungAblegen(page);

  const link = page.getByRole('link', { name: /Lösungsheft/ });
  await expect(link).toBeVisible();

  const href = await link.getAttribute('href');
  expect(href).toContain('loesungen.pdf');
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
});
