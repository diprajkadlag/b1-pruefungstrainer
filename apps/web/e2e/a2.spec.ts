import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { durchDenEingang, ersterBesuch, oeffnen } from './hilfe';

/**
 * End-to-end for the A2 paper.
 *
 * A2 is the one level that is not modular. B1 and B2 award 100 points per
 * module and certify each on its own; A2 is a single examination of 100 points
 * in which each part contributes at most 25, passed only if the total, the
 * written floor and the speaking floor are all met at once. That difference is
 * invisible to every other test in this suite — a paper marked on the B1 scale
 * would quadruple every candidate's score and still look plausible — so this
 * sits the module and checks the number on the card.
 *
 * It also covers the one place where an item legitimately has no answer: the
 * small-ad matching task, where exactly one person finds nothing and the key
 * is `x`.
 *
 * Everything past the front door is reached through `hilfe.ts`: the level and
 * the screen-or-paper answer are seeded, exactly as a returning learner brings
 * them, so these tests stay about A2 and not about the way in.
 */

const examPfad = fileURLToPath(
  new URL('../../../content/exams/a2-pruefung-01/exam.json', import.meta.url),
);
const exam = JSON.parse(readFileSync(examPfad, 'utf-8'));

type Item = { nr: number; loesung: string; typ: string };
const lesenItems: Item[] = exam.lesen.teile.flatMap((t: { items: Item[] }) => t.items);

async function a2Starten(page: Page, module: string[]) {
  await oeffnen(page, 'A2');
  await page.getByRole('button', { name: /Übungsprüfung A2 1/ }).click();

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

/** The last module's closing button, which is what opens the result screen. */
async function auswerten(page: Page) {
  await page.getByRole('button', { name: /Auswertung ansehen/ }).click();
}

test.describe('A2', () => {
  test('offers one button per level and then lists only that level’s papers', async ({
    page,
  }) => {
    await ersterBesuch(page);

    await expect(page.getByRole('heading', { name: 'Welches Niveau?' })).toBeVisible();
    for (const stufe of ['A1', 'A2', 'B1', 'B2']) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^${stufe}`) }),
      ).toBeVisible();
    }

    await page.getByRole('button', { name: /^A2/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Wie möchten Sie üben?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Am Bildschirm/ }).click();

    await expect(page.getByRole('button', { name: /Übungsprüfung A2 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Übungsprüfung 1 —/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Übungsprüfung B2 1/ })).toHaveCount(0);

    // Reading is 30 minutes at A2 and 65 at both B levels; the module card must
    // follow the level chosen at the door, not the level that loaded first.
    await expect(page.locator('.modulkarte', { hasText: 'Lesen' })).toContainText(
      '30 Min.',
    );
  });

  test('the chip goes back to the level question and swaps the papers', async ({
    page,
  }) => {
    // The chip is what the level tabs used to be: the one way from an A2 shelf
    // to somebody else's. A stale A2 paper left in the list would be startable
    // from a B1 shelf and then marked on the wrong scale.
    await oeffnen(page, 'A2');
    await expect(
      page.getByRole('button', { name: /Am Bildschirm ändern/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: /^A2 ändern/ }).click();
    await expect(page.getByRole('heading', { name: 'Welches Niveau?' })).toBeVisible();
    await page.getByRole('button', { name: /^B1/ }).click();

    // The mode answer stands, so B1's own shelf comes straight up.
    await expect(page.getByRole('button', { name: /Übungsprüfung 1 —/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Übungsprüfung A2 1/ })).toHaveCount(0);
    await expect(page.locator('.modulkarte', { hasText: 'Lesen' })).toContainText(
      '65 Min.',
    );
  });

  test('has twenty reading items in four parts', async ({ page }) => {
    await a2Starten(page, ['Lesen']);
    await page.locator('input[name="item-1"]').first().waitFor();

    expect(lesenItems).toHaveLength(20);
    // The matching task offers six ads and the x for "none of these fits".
    await expect(page.locator('input[name="item-20"]')).toHaveCount(7);
  });

  test('marks a fully correct reading module as 25 points, not 100', async ({ page }) => {
    await a2Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, new Set());
    await auswerten(page);

    const karte = page.locator('.karte').first();
    await expect(karte).toContainText('25');
    await expect(karte).toContainText('/25');
    await expect(karte).toContainText(`${lesenItems.length} von ${lesenItems.length}`);
  });

  test('shows no per-part verdict, because A2 has none to show', async ({ page }) => {
    await a2Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, new Set());
    await auswerten(page);

    // Full marks — and still no "bestanden". The examination is passed as a
    // whole or not at all, and Schreiben and Sprechen are not marked yet.
    await expect(page.locator('.karte--bestanden')).toHaveCount(0);
    await expect(page.locator('.karte--gefallen')).toHaveCount(0);
    await expect(page.getByText('A2 ist eine Prüfung, keine vier.')).toBeVisible();
  });

  test('converts the raw score with the published 1.25 factor', async ({ page }) => {
    // 16 of 20 right is 16 Messpunkte, and 16 x 1.25 is exactly 20 points.
    // Rounding that to a whole number would be right here by luck; the two
    // wrong items are chosen so the next assertion catches it.
    const falsch = new Set([3, 8, 14, 20]);
    await a2Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, falsch);
    await auswerten(page);

    await expect(page.locator('.karte').first()).toContainText('20');
    await page.getByRole('tab', { name: 'Lösungen' }).click();
    await expect(page.locator('.loesung--falsch')).toHaveCount(falsch.size);
  });

  test('keeps the quarter point instead of rounding it away', async ({ page }) => {
    // 17 right is 21.25 points. A whole-number conversion would show 21 and
    // quietly cost the candidate a quarter mark on every part of every paper.
    const falsch = new Set([5, 11, 17]);
    await a2Starten(page, ['Lesen']);
    await beantworten(page, lesenItems, falsch);
    await auswerten(page);

    await expect(page.locator('.karte').first()).toContainText('21.25');
  });

  test('never ships the answer key to the browser before submission', async ({
    page,
  }) => {
    const geladen: string[] = [];
    page.on('response', (r) => geladen.push(r.url()));

    await a2Starten(page, ['Lesen']);
    await page.locator('input[name="item-1"]').first().waitFor();

    expect(geladen.some((u) => u.includes('exam.keys.json'))).toBe(false);
    const html = await page.content();
    expect(html).not.toContain('begruendung');
  });
});

test.describe('A2 Spickzettel', () => {
  test('the level chosen at the door decides which sheet opens', async ({ page }) => {
    await durchDenEingang(page, 'A2');
    await page.getByRole('button', { name: /Spickzettel/ }).click();

    await expect(page.getByRole('heading', { name: /A2 Spickzettel/ })).toBeVisible();
  });

  test('states the whole-examination pass rule', async ({ page }) => {
    // The rule that makes A2 different from the other two levels is the first
    // thing the sheet has to get across.
    await oeffnen(page, 'A2');
    await page.getByRole('button', { name: /Spickzettel/ }).click();

    await expect(page.getByText(/60 von 100 Punkten/)).toBeVisible();
    await expect(page.getByText(/45 von 75/)).toBeVisible();
    await expect(page.getByText(/15 von 25/)).toBeVisible();
  });
});
