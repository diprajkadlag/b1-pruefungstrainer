import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { Sprechtraining } from '@pruefung/core';

/**
 * End-to-end for the speaking trainer.
 *
 * The content itself is gated by tools/validate.py, so this file covers only
 * what a browser can answer: that all fifty tasks reach the screen, that the
 * task opens without its answers, and that the culture note and model answers
 * are one tap away rather than absent.
 */

const daten: Sprechtraining = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../public/content/sprechen-b1.json', import.meta.url)),
    'utf-8',
  ),
);

async function oeffnen(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'B1' }).click();
  await page.getByRole('button', { name: /Sprechtraining öffnen/ }).click();
  await page.locator('.sprech__liste').waitFor();
}

test.describe('Sprechtraining', () => {
  test('lists all fifty tasks', async ({ page }) => {
    await oeffnen(page);
    await expect(page.locator('.sprech__eintrag')).toHaveCount(50);
    expect(daten.aufgaben).toHaveLength(50);
  });

  test('is offered at B1 only, since only B1 has one', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'A1' }).click();
    await expect(page.getByRole('button', { name: /Sprechtraining öffnen/ })).toHaveCount(
      0,
    );
    await page.getByRole('tab', { name: 'B1' }).click();
    await expect(
      page.getByRole('button', { name: /Sprechtraining öffnen/ }),
    ).toBeVisible();
  });

  test('opens a task on the task, not on the answers', async ({ page }) => {
    // A model answer read before speaking is a text you agree with rather than
    // something you produced, so the card must not open on it.
    await oeffnen(page);
    await page.locator('.sprech__eintrag').first().click();

    const erste = daten.aufgaben[0]!;
    await expect(page.locator('.sprech__kopf h2')).toHaveText(erste.teil2.titel);
    await expect(page.locator('.situation')).toHaveText(erste.teil1.situation);
    await expect(page.locator('.sprech__punkte').first().locator('li')).toHaveCount(5);

    const html = await page.content();
    expect(html).not.toContain(erste.teil2.musterloesung[0]!.slice(0, 60));
    expect(html).not.toContain(erste.teil2.kultur.de.slice(0, 60));
  });

  test('shows the German context and its English gloss on request', async ({ page }) => {
    await oeffnen(page);
    await page.locator('.sprech__eintrag').first().click();
    await page.getByRole('tab', { name: 'So ist es in Deutschland' }).click();

    const erste = daten.aufgaben[0]!;
    await expect(page.locator('.kulturkasten')).toContainText(
      erste.teil2.kultur.de.slice(0, 60),
    );
    await expect(page.locator('.kulturkasten__en')).toContainText(
      erste.teil2.kultur.en.slice(0, 60),
    );
    await expect(page.locator('.sprech__wortschatz tr')).toHaveCount(
      erste.teil2.wortschatz.length,
    );
  });

  test('shows the model answers with the time they take to say', async ({ page }) => {
    await oeffnen(page);
    await page.locator('.sprech__eintrag').first().click();
    await page.getByRole('tab', { name: 'Musterlösung' }).click();

    const erste = daten.aufgaben[0]!;
    await expect(page.locator('.sprech__folie')).toHaveCount(5);
    await expect(page.locator('.sprech__inhalt')).toContainText(
      erste.teil2.musterloesung[0]!.slice(0, 60),
    );
    // The printed timing is the point: it tells the learner whether what they
    // wrote actually fits the three minutes.
    await expect(page.locator('.sprech__umfang')).toContainText(
      `${erste.teil2.umfang.woerter} Wörter`,
    );
  });

  test('pages between tasks and stops at the ends', async ({ page }) => {
    await oeffnen(page);
    await page.locator('.sprech__eintrag').first().click();
    await expect(page.getByRole('button', { name: /← Aufgabe/ })).toBeDisabled();

    await page.getByRole('button', { name: /Aufgabe 2 →/ }).click();
    await expect(page.locator('.sprech__kopf h2')).toHaveText(
      daten.aufgaben[1]!.teil2.titel,
    );
    await expect(page.getByRole('button', { name: /← Aufgabe 1/ })).toBeEnabled();
  });

  test('searches by topic and by vocabulary', async ({ page }) => {
    await oeffnen(page);
    await page.getByPlaceholder('Thema oder Wort suchen …').fill('Urlaub');
    const treffer = await page.locator('.sprech__eintrag').count();
    expect(treffer).toBeGreaterThan(0);
    expect(treffer).toBeLessThan(50);

    await page.getByPlaceholder('Thema oder Wort suchen …').fill('xyzzy');
    await expect(page.locator('.sprech__eintrag')).toHaveCount(0);
  });
});
