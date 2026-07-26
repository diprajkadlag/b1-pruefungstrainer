import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * End-to-end: the printable papers.
 *
 * Two things matter here. The links must actually resolve — a 404 behind a
 * download button is worse than no button. And the solution booklet must obey
 * the same rule as the JSON answer key: not offered until the attempt closes.
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

const erste = registry.pruefungen[0];
const hatPdfs: boolean = erste.pdfsVorAbgabe.length > 0;

type Item = { nr: number; loesung: string; typ: string };
const lesenItems: Item[] = exam.lesen.teile.flatMap((t: { items: Item[] }) => t.items);

async function pruefungAblegen(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('z. B. Ravi').fill('Testkandidat');
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
  await page.getByRole('button', { name: /Prüfung abgeben/ }).click();
  await page.locator('.karte').first().waitFor();
}

test.skip(!hatPdfs, 'PDFs were not built for this export — run npm run content:pdf');

test('offers the papers for printing before the exam starts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Lieber auf Papier?' }).waitFor();

  for (const name of ['Kandidatenblätter', 'Antwortbogen', 'Sprechen-Karten']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }
});

test('the print links resolve to a real PDF', async ({ page, request }) => {
  await page.goto('/');
  const links = page.locator('.druck__link');
  // toHaveCount, not count(): the block only renders once the registry fetch
  // resolves, and a bare count() reads whatever is there at that instant.
  const anzahl = erste.pdfsVorAbgabe.length;
  await expect(links).toHaveCount(anzahl);

  for (let i = 0; i < anzahl; i++) {
    const href = await links.nth(i).getAttribute('href');
    const res = await request.get(href!);
    expect(res.status(), `${href} should exist`).toBe(200);
    // A PDF, not an SPA fallback page dressed up as one.
    expect(res.headers()['content-type']).toContain('pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
});

test('switching paper switches which PDFs are offered', async ({ page }) => {
  test.skip(registry.pruefungen.length < 2, 'needs at least two papers');
  await page.goto('/');

  // toHaveAttribute retries, so this cannot read the previous paper's href in
  // the frame between the click and React re-rendering the links.
  const ersterLink = page.locator('.druck__link').first();
  await expect(ersterLink).toHaveAttribute('href', new RegExp(registry.pruefungen[0].id));

  await page.getByRole('button', { name: /Übungsprüfung 2/ }).click();
  await expect(ersterLink).toHaveAttribute('href', new RegExp(registry.pruefungen[1].id));
});

test('never offers the solution booklet before submission', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Lieber auf Papier?' }).waitFor();

  // Not on the start screen, and not fetched while the exam is open.
  await expect(page.getByRole('link', { name: /Lösungsheft/ })).toHaveCount(0);
  expect(await page.content()).not.toContain('loesungen.pdf');

  const geladen: string[] = [];
  page.on('response', (r) => geladen.push(r.url()));

  await page.getByPlaceholder('z. B. Ravi').fill('Testkandidat');
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
