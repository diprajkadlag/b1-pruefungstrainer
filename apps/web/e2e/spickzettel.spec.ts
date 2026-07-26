import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * End-to-end: the cheat sheet.
 *
 * Like the exam spec, the expectations come from the source content rather
 * than from the app, so a screen that silently renders half the data fails
 * here instead of shipping.
 */

const lade = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../content/lernhilfe/${name}`, import.meta.url)),
      'utf-8',
    ),
  );

const lernhilfe = lade('lernhilfe.json');
const wortschatz = lade('wortschatz.json');

const verben: { inf: string; en: string }[] = wortschatz.verben.flatMap(
  (g: { eintraege: { inf: string; en: string }[] }) => g.eintraege,
);

test('opens from the start screen without starting an exam', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();

  await expect(page.getByRole('heading', { name: lernhilfe.titel })).toBeVisible();
  // No attempt was created, so no timer may be running.
  await expect(page.getByText('Verbleibend')).toHaveCount(0);
});

test('every tab renders its content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();

  // Überblick is the default tab.
  await expect(page.getByRole('cell', { name: '65 Min.' })).toBeVisible();

  await page.getByRole('tab', { name: 'Strategie' }).click();
  for (const s of lernhilfe.strategie) {
    await expect(page.getByRole('heading', { name: s.modul, exact: true })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Redemittel' }).click();
  for (const r of lernhilfe.redemittel) {
    await expect(page.getByRole('heading', { name: r.bereich })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Grammatik' }).click();
  await expect(
    page.getByRole('heading', { name: lernhilfe.grammatik[0].thema }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Wortschatz' }).click();
  await expect(
    page.getByRole('rowheader', { name: 'sein', exact: false }).first(),
  ).toBeVisible();
});

test('grammar tables are as wide as their headers', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();
  await page.getByRole('tab', { name: 'Grammatik' }).click();

  const tabellen = page.locator('.spick__tabelle');
  await expect(tabellen).toHaveCount(lernhilfe.grammatik.length);

  for (const [i, g] of lernhilfe.grammatik.entries()) {
    const kopf = tabellen.nth(i).locator('thead th');
    await expect(kopf).toHaveCount(g.tabelle.kopf.length);
  }
});

test('search narrows the vocabulary to matching entries', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();
  await page.getByRole('tab', { name: 'Wortschatz' }).click();

  await page.getByRole('searchbox').fill('to remember');
  await expect(page.getByRole('rowheader', { name: /sich erinnern/ })).toBeVisible();

  // A term matching one verb must not leave the other 100+ on screen.
  const zeilen = page.locator('tbody tr');
  await expect(zeilen).toHaveCount(1);
  expect(verben.filter((v) => v.en.includes('to remember'))).toHaveLength(1);
});

test('a Redemittel search finds the phrase for making a suggestion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();
  await page.getByRole('tab', { name: 'Redemittel' }).click();

  await page.getByRole('searchbox').fill('Wie wäre es');
  await expect(page.getByText('Wie wäre es, wenn wir …?')).toBeVisible();
  await expect(page.getByText('Vielen Dank für Ihre Aufmerksamkeit.')).toHaveCount(0);
});
