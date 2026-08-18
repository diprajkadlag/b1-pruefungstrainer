import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * End-to-end for the B2 paper.
 *
 * B2 brings three task shapes B1 never had — inserting a sentence into a gap,
 * matching an opinion to a heading, matching a regulation paragraph to a table
 * of contents — and all three answer with a letter that lives on the Teil
 * rather than on the item. Nothing else in the suite would notice if those
 * controls rendered but scored against the wrong key, so this sits the module
 * and marks it against the source content.
 */

const examPfad = fileURLToPath(
  new URL('../../../content/exams/b2-pruefung-01/exam.json', import.meta.url),
);
const exam = JSON.parse(readFileSync(examPfad, 'utf-8'));

type Item = { nr: number; loesung: string; typ: string };
const lesenItems: Item[] = exam.lesen.teile.flatMap((t: { items: Item[] }) => t.items);

async function b2Starten(page: Page, module: string[]) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'B2' }).click();
  await page.getByPlaceholder('z. B. Ravi').fill('Testkandidat');
  await page.getByRole('button', { name: /Übungsprüfung B2 1/ }).click();

  for (const label of ['Lesen', 'Hören', 'Schreiben', 'Sprechen']) {
    const box = page.getByRole('checkbox', { name: new RegExp(label) });
    const soll = module.includes(label);
    if ((await box.isChecked()) !== soll) await box.click();
  }
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
}

async function beantworten(page: Page, items: Item[], falsch: Set<number>) {
  for (const item of items) {
    const wert = falsch.has(item.nr) ? (item.loesung === 'a' ? 'b' : 'a') : item.loesung;
    await page
      .locator(`input[name="item-${item.nr}"][value="${wert}"]`)
      .check({ force: true });
  }
}

test.describe('B2', () => {
  test('offers the level tabs and lists only that level’s papers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Übungsprüfung 1/ })).toBeVisible();

    await page.getByRole('tab', { name: 'B2' }).click();
    await expect(page.getByRole('button', { name: /Übungsprüfung B2 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Übungsprüfung 1 —/ })).toHaveCount(0);

    // Writing is 75 minutes at B2 and 60 at B1; the card must follow the tab.
    await expect(page.getByText('75 Min.')).toBeVisible();
  });

  test('renders the new task types with their own answer letters', async ({ page }) => {
    await b2Starten(page, ['Lesen']);

    // Teil 1 matches statements to four writers, not three.
    await expect(page.locator('input[name="item-1"]')).toHaveCount(4);

    // Teil 2 offers the eight sentences a-h and marks the gaps in the text.
    const satzEinfuegen = exam.lesen.teile[1];
    await expect(page.locator('input[name="item-10"]')).toHaveCount(
      satzEinfuegen.optionenliste.length,
    );
    for (const nr of [10, 11, 12, 13, 14, 15]) {
      await expect(
        page.locator('.luecke', { hasText: String(nr) }).first(),
      ).toBeVisible();
    }

    // Teil 5 matches three paragraphs against eight headings.
    await expect(page.locator('input[name="item-28"]')).toHaveCount(8);
  });

  test('marks a fully correct reading module as 100 / sehr gut', async ({ page }) => {
    await b2Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, new Set());
    await page.getByRole('button', { name: /Prüfung abgeben/ }).click();

    const karte = page.locator('.karte--bestanden').first();
    await expect(karte).toContainText('100');
    await expect(karte).toContainText('sehr gut');
    await expect(karte).toContainText(`${lesenItems.length} von ${lesenItems.length}`);
  });

  test('scores the letter-matching tasks against the real key', async ({ page }) => {
    // All six wrong items sit in the three tasks that answer with a letter
    // from the Teil's list, so a mis-wired key there cannot pass unnoticed.
    const falsch = new Set([10, 13, 22, 25, 28, 30]);
    const erwartet = Math.round(
      ((lesenItems.length - falsch.size) * 100) / lesenItems.length,
    );

    await b2Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, falsch);
    await page.getByRole('button', { name: /Prüfung abgeben/ }).click();

    await expect(page.locator('.karte').first()).toContainText(String(erwartet));
    await page.getByRole('tab', { name: 'Lösungen' }).click();
    await expect(page.locator('.loesung--falsch')).toHaveCount(falsch.size);
  });

  test('never ships the answer key to the browser before submission', async ({
    page,
  }) => {
    const geladen: string[] = [];
    page.on('response', (r) => geladen.push(r.url()));

    await b2Starten(page, ['Lesen']);
    await page.locator('input[name="item-1"]').first().waitFor();

    expect(geladen.some((u) => u.includes('exam.keys.json'))).toBe(false);
    const html = await page.content();
    expect(html).not.toContain('begruendung');
  });
});

test.describe('B2 Spickzettel', () => {
  const b2Lernhilfe = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../content/lernhilfe/b2/lernhilfe.json', import.meta.url),
      ),
      'utf-8',
    ),
  );
  const b2Wortschatz = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../content/lernhilfe/b2/wortschatz.json', import.meta.url),
      ),
      'utf-8',
    ),
  );

  test('the level tab decides which sheet opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'B2' }).click();
    await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();

    await expect(page.getByRole('heading', { name: b2Lernhilfe.titel })).toBeVisible();
    // 75 minutes for writing is the B2 number; B1's sheet says 60.
    await expect(page.getByRole('cell', { name: '75 Min.' })).toBeVisible();
  });

  test('carries the full B2 word list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'B2' }).click();
    await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();
    await page.getByRole('tab', { name: 'Wortschatz' }).click();

    const verben = b2Wortschatz.verben.flatMap(
      (g: { eintraege: unknown[] }) => g.eintraege,
    );
    expect(verben.length).toBeGreaterThanOrEqual(100);
    // Matched by row, not by exact text: irregular verbs carry a marker in
    // the same cell as the infinitive.
    await expect(page.getByRole('row', { name: /einräumen/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /sich beziehen auf/ })).toBeVisible();
  });
});
