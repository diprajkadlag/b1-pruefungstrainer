import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { ersterBesuch, oeffnen } from './hilfe';

/**
 * End-to-end for the A1 paper.
 *
 * A1 is the second non-modular level, and it is not a copy of A2. Its parts are
 * recorded as 15 raw points and multiplied by 1.66 only when the overall score
 * is worked out, and it sets exactly one pass condition where A2 sets three.
 * Neither difference is visible to any other test in this suite.
 *
 * It also covers the two task shapes no other level has: a reading item that
 * offers two places rather than three options, and a writing task that is a
 * form with five blanks rather than a text.
 */

const examPfad = fileURLToPath(
  new URL('../../../content/exams/a1-pruefung-01/exam.json', import.meta.url),
);
const exam = JSON.parse(readFileSync(examPfad, 'utf-8'));

type Item = { nr: number; loesung: string; typ: string };
const lesenItems: Item[] = exam.lesen.teile.flatMap((t: { items: Item[] }) => t.items);

async function a1Starten(page: Page, module: string[]) {
  await oeffnen(page, 'A1');
  await page.getByRole('button', { name: /Übungsprüfung A1 1/ }).click();

  for (const label of ['Lesen', 'Hören', 'Schreiben', 'Sprechen']) {
    const box = page.getByRole('checkbox', { name: new RegExp(label) });
    const soll = module.includes(label);
    if ((await box.isChecked()) !== soll) await box.click();
  }
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
}

/** Closing the last module is what hands the paper over to the marking. */
async function abgeben(page: Page) {
  await page.getByRole('button', { name: /Auswertung ansehen/ }).click();
}

async function beantworten(page: Page, items: Item[], falsch: Set<number>) {
  for (const item of items) {
    // Teil 2 has only a and b, so the "wrong" answer has to stay inside the
    // two the item actually offers.
    const andere =
      item.typ === 'zwei_optionen' ? (item.loesung === 'a' ? 'b' : 'a') : 'x';
    const wert = falsch.has(item.nr)
      ? item.typ === 'richtig_falsch'
        ? item.loesung === 'richtig'
          ? 'falsch'
          : 'richtig'
        : andere
      : item.loesung;
    await page
      .locator(`input[name="item-${item.nr}"][value="${wert}"]`)
      .check({ force: true });
  }
}

test.describe('A1', () => {
  test('asks for the level first, then lists only that level’s papers', async ({
    page,
  }) => {
    // The four levels used to be tabs above one long page. They are now the
    // first of the two questions at the door, and the answer still decides the
    // whole shelf behind it.
    await ersterBesuch(page);
    await expect(page.getByRole('heading', { name: 'Welches Niveau?' })).toBeVisible();
    for (const stufe of ['A1', 'A2', 'B1', 'B2']) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^${stufe}`) }),
      ).toBeVisible();
    }

    await page.getByRole('button', { name: /^A1/ }).click();
    await page.getByRole('button', { name: /Am Bildschirm/ }).click();

    // The chip reports the answer back, and the papers below belong to it.
    await expect(page.getByRole('button', { name: 'A1 ändern' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Übungsprüfung A1 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Übungsprüfung A2 1/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Übungsprüfung 1 —/ })).toHaveCount(0);
  });

  test('has fifteen reading items in three parts', async ({ page }) => {
    await a1Starten(page, ['Lesen']);
    await page.locator('input[name="item-1"]').first().waitFor();

    expect(lesenItems).toHaveLength(15);
    expect(exam.lesen.teile).toHaveLength(3);
  });

  test('offers Teil 2 exactly two answers, not three', async ({ page }) => {
    // The only task in the whole collection with two options. A third box would
    // offer an answer that cannot be right.
    await a1Starten(page, ['Lesen']);
    await page.locator('input[name="item-6"]').first().waitFor();

    await expect(page.locator('input[name="item-6"]')).toHaveCount(2);
    await expect(page.locator('input[name="item-6"][value="c"]')).toHaveCount(0);
    // And a richtig/falsch item next door still has its two.
    await expect(page.locator('input[name="item-1"]')).toHaveCount(2);
  });

  test('marks a fully correct reading module as 15 raw points', async ({ page }) => {
    await a1Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, new Set());
    await abgeben(page);

    const karte = page.locator('.karte').first();
    await expect(karte).toContainText('15');
    await expect(karte).toContainText('/15');
    await expect(karte).toContainText(`${lesenItems.length} von ${lesenItems.length}`);
  });

  test('shows no per-part verdict, because A1 has none to show', async ({ page }) => {
    await a1Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, new Set());
    await abgeben(page);

    await expect(page.locator('.karte--bestanden')).toHaveCount(0);
    await expect(page.locator('.karte--gefallen')).toHaveCount(0);
  });

  test('counts raw points rather than converting per part', async ({ page }) => {
    // 12 of 15 right is 12 raw points, not 12 x 1.66 rounded. The conversion
    // belongs to the whole examination and happens nowhere else.
    const falsch = new Set([2, 8, 14]);
    await a1Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, falsch);
    await abgeben(page);

    await expect(page.locator('.karte').first()).toContainText('12');
    await page.getByRole('tab', { name: 'Lösungen' }).click();
    await expect(page.locator('.loesung--falsch')).toHaveCount(falsch.size);
  });

  test('opens Schreiben Teil 1 as a form with five blanks', async ({ page }) => {
    await a1Starten(page, ['Schreiben']);
    await page.locator('.formular').first().waitFor();

    await expect(page.locator('.formular__zeile')).toHaveCount(5);
    // The labels are on the paper; the answers are not. The candidate has to
    // read "14. März 1996" out of the situation and write it the way a form
    // wants it, so the formatted date is the answer and must not be here.
    await expect(page.getByText('Familienname')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('14.03.1996');
    expect(html).not.toContain('der Familienname, Maria der Vorname');
  });

  test('keeps the form entries across a reload', async ({ page }) => {
    // The form has no store of its own — the five entries are folded into the
    // one string the attempt already saves, so this proves the fold survives
    // the round trip and not just the render.
    await a1Starten(page, ['Schreiben']);
    await page.locator('.formular__zeile input').first().fill('Kadlag');
    await page.waitForTimeout(1200); // let the autosave debounce flush

    await page.reload();
    await page.getByRole('button', { name: 'Fortsetzen' }).first().click();
    await expect(page.locator('.formular__zeile input').first()).toHaveValue('Kadlag');
    // The other four blanks are still blank, not filled with the same entry.
    await expect(page.locator('.formular__zeile input').nth(1)).toHaveValue('');
  });

  test('never ships the answer key to the browser before submission', async ({
    page,
  }) => {
    const geladen: string[] = [];
    page.on('response', (r) => geladen.push(r.url()));

    await a1Starten(page, ['Lesen']);
    await page.locator('input[name="item-1"]').first().waitFor();

    expect(geladen.some((u) => u.includes('exam.keys.json'))).toBe(false);
    const html = await page.content();
    expect(html).not.toContain('begruendung');
  });
});

test.describe('A1 Spickzettel', () => {
  test('the chosen level decides which sheet opens', async ({ page }) => {
    await oeffnen(page, 'A1');
    await page.getByRole('button', { name: /Spickzettel/ }).click();

    await expect(page.getByRole('heading', { name: /A1 Spickzettel/ })).toBeVisible();
  });

  test('states the one pass condition A1 actually has', async ({ page }) => {
    // A1 sets a single condition where A2 sets three, and saying otherwise
    // would send a candidate into the exam with the wrong plan.
    await oeffnen(page, 'A1');
    await page.getByRole('button', { name: /Spickzettel/ }).click();

    await expect(page.getByText(/60 von 100 Punkten/)).toBeVisible();
    await expect(page.getByText(/1,66/)).toBeVisible();
  });
});
