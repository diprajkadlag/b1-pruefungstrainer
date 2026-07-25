import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * End-to-end: sit a paper and check that it is marked correctly.
 *
 * The answer key is read from the source content, not from the app, so the
 * expected score is computed independently of the code under test. If the app
 * and the content ever disagree, this fails.
 */

const examPfad = fileURLToPath(
  new URL('../../../content/exams/pruefung-01/exam.json', import.meta.url),
);
const exam = JSON.parse(readFileSync(examPfad, 'utf-8'));

type Item = { nr: number; loesung: string; typ: string };
const itemsVon = (modul: 'lesen' | 'hoeren'): Item[] =>
  exam[modul].teile.flatMap((t: { items: Item[] }) => t.items);

async function pruefungStarten(page: Page, module: string[]) {
  await page.goto('/');
  await page.getByPlaceholder('z. B. Ravi').fill('Testkandidat');
  await page.getByRole('button', { name: /Übungsprüfung 1/ }).click();

  for (const label of ['Lesen', 'Hören', 'Schreiben', 'Sprechen']) {
    const box = page.getByRole('checkbox', { name: new RegExp(label) });
    const soll = module.includes(label);
    if ((await box.isChecked()) !== soll) await box.click();
  }
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
}

/** Answer every item in the current module, correctly or deliberately wrong. */
async function beantworten(page: Page, items: Item[], falsch: Set<number>) {
  for (const item of items) {
    const wert = falsch.has(item.nr) ? falscheAntwort(item) : item.loesung;
    await page
      .locator(`input[name="item-${item.nr}"][value="${wert}"]`)
      .check({ force: true });
  }
}

function falscheAntwort(item: Item): string {
  switch (item.typ) {
    case 'richtig_falsch':
      return item.loesung === 'richtig' ? 'falsch' : 'richtig';
    case 'ja_nein':
      return item.loesung === 'ja' ? 'nein' : 'ja';
    case 'zuordnung_anzeigen':
      return item.loesung === 'a' ? 'b' : 'a';
    default:
      return item.loesung === 'a' ? 'b' : 'a';
  }
}

test.describe('Prüfung ablegen', () => {
  test('marks a fully correct reading module as 100 / sehr gut', async ({ page }) => {
    const items = itemsVon('lesen');
    await pruefungStarten(page, ['Lesen']);
    await beantworten(page, items, new Set());
    await page.getByRole('button', { name: /Prüfung abgeben/ }).click();

    const karte = page.locator('.karte--bestanden').first();
    await expect(karte).toContainText('100');
    await expect(karte).toContainText('sehr gut');
    await expect(karte).toContainText(`${items.length} von ${items.length}`);
  });

  test('scores a deliberately wrong sheet exactly as hand-calculated', async ({ page }) => {
    const items = itemsVon('lesen');
    // 6 wrong out of 30 -> 24 correct -> round(24 * 100 / 30) = 80 -> "gut".
    const falsch = new Set([1, 5, 9, 14, 20, 27]);
    const erwartet = Math.round(((items.length - falsch.size) * 100) / items.length);

    await pruefungStarten(page, ['Lesen']);
    await beantworten(page, items, falsch);
    await page.getByRole('button', { name: /Prüfung abgeben/ }).click();

    await expect(page.locator('.karte').first()).toContainText(String(erwartet));
    await expect(page.locator('.karte').first()).toContainText('gut');

    // Every wrong item, and only those, is flagged in the review.
    await page.getByRole('tab', { name: 'Lösungen' }).click();
    await expect(page.locator('.loesung--falsch')).toHaveCount(falsch.size);
    await expect(page.locator('.loesung--richtig')).toHaveCount(
      items.length - falsch.size,
    );
  });

  test('treats unanswered items as wrong, not as absent', async ({ page }) => {
    const items = itemsVon('lesen');
    await pruefungStarten(page, ['Lesen']);
    // Answer only the first five and submit.
    await beantworten(page, items.slice(0, 5), new Set());
    await page.getByRole('button', { name: /Prüfung abgeben/ }).click();

    const karte = page.locator('.karte').first();
    await expect(karte).toContainText(`5 von ${items.length}`);
    await expect(page.locator('.karte--gefallen')).toHaveCount(1);
  });

  test('never ships the answer key to the browser before submission', async ({ page }) => {
    const geladen: string[] = [];
    page.on('response', (r) => geladen.push(r.url()));

    await pruefungStarten(page, ['Lesen']);
    await page.locator('input[name="item-1"]').first().waitFor();

    expect(geladen.some((u) => u.includes('exam.keys.json'))).toBe(false);
    const html = await page.content();
    expect(html).not.toContain('begruendung');
  });

  test('locks a listening part once it has been played', async ({ page }) => {
    await pruefungStarten(page, ['Hören']);
    const knopf = page.getByRole('button', { name: /Teil 1 abspielen/ });
    await expect(knopf).toBeVisible();

    await knopf.click();
    // Playback started, so the start control is gone and cannot be re-triggered.
    await expect(knopf).toBeHidden();
    await expect(page.locator('.player__lauf').first()).toBeVisible();
  });

  test('auto-submits when the module clock runs out', async ({ page }) => {
    await page.clock.install();
    await pruefungStarten(page, ['Lesen']);
    const items = itemsVon('lesen');
    await beantworten(page, items.slice(0, 3), new Set());

    // Jump past the 65-minute limit. Milliseconds, because the "mm:ss" string
    // form rejects a minute value of 60 or more.
    await page.clock.fastForward(66 * 60 * 1000);
    await expect(page.locator('.ablauf')).toBeVisible();
    await expect(page.locator('.karte').first()).toBeVisible({ timeout: 15_000 });
  });

  test('keeps answers across a reload', async ({ page }) => {
    const items = itemsVon('lesen');
    await pruefungStarten(page, ['Lesen']);
    await beantworten(page, items.slice(0, 4), new Set());
    await page.waitForTimeout(1200); // let the autosave debounce flush

    await page.reload();
    await page.getByRole('button', { name: 'Fortsetzen' }).first().click();
    await expect(
      page.locator(`input[name="item-1"][value="${items[0]!.loesung}"]`),
    ).toBeChecked();
  });

  test('offers the glossary and grammar with real word forms', async ({ page }) => {
    await pruefungStarten(page, ['Lesen']);
    await page.getByRole('button', { name: /Prüfung abgeben/ }).click();

    await page.getByRole('tab', { name: 'Wortschatz' }).click();
    await expect(page.locator('.glossartabelle tbody tr').first()).toBeVisible();
    const zeilen = await page.locator('.glossartabelle tbody tr').count();
    expect(zeilen).toBeGreaterThanOrEqual(25);

    await page.getByRole('tab', { name: 'Grammatik' }).click();
    await expect(page.locator('.grammatikpunkt')).toHaveCount(exam.grammatik.length);
    await expect(page.locator('.uebungen li').first()).toBeVisible();
  });
});
