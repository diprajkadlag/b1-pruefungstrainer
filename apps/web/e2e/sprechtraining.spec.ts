import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { SprechtrainingB1, SprechtrainingB2 } from '@pruefung/core';

/**
 * End-to-end for the speaking trainer, at both levels.
 *
 * The content itself is gated by tools/validate.py, so this file covers only
 * what a browser can answer: that every task reaches the screen, that a task
 * opens on the task and not on its answers, and that the culture note and the
 * model answers are one tap away rather than absent.
 *
 * B1 and B2 share the shell and not the card. B1 presents one topic over five
 * slides; B2 offers two topics to choose from and then a debate. The tests
 * that touch the card are therefore written per level rather than looped.
 */

function laden<T>(datei: string): T {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../public/content/${datei}`, import.meta.url)),
      'utf-8',
    ),
  ) as T;
}

const b1 = laden<SprechtrainingB1>('sprechen-b1.json');
const b2 = laden<SprechtrainingB2>('sprechen-b2.json');

async function oeffnen(page: Page, stufe: 'B1' | 'B2') {
  await page.goto('/');
  await page.getByRole('tab', { name: stufe }).click();
  await page.getByRole('button', { name: /Sprechtraining öffnen/ }).click();
  await page.locator('.sprech__liste').waitFor();
}

test.describe('Sprechtraining — the shared shell', () => {
  test('lists all fifty tasks at each level', async ({ page }) => {
    await oeffnen(page, 'B1');
    await expect(page.locator('.sprech__eintrag')).toHaveCount(50);
    await oeffnen(page, 'B2');
    await expect(page.locator('.sprech__eintrag')).toHaveCount(50);
    expect(b1.aufgaben).toHaveLength(50);
    expect(b2.aufgaben).toHaveLength(50);
  });

  test('is offered where a trainer exists and nowhere else', async ({ page }) => {
    await page.goto('/');
    for (const stufe of ['A1', 'A2']) {
      await page.getByRole('tab', { name: stufe }).click();
      await expect(
        page.getByRole('button', { name: /Sprechtraining öffnen/ }),
      ).toHaveCount(0);
    }
    for (const stufe of ['B1', 'B2']) {
      await page.getByRole('tab', { name: stufe }).click();
      await expect(
        page.getByRole('button', { name: /Sprechtraining öffnen/ }),
      ).toBeVisible();
    }
  });

  test('the entry card describes the right exam at each level', async ({ page }) => {
    // B2 Sprechen is a different examination; the card must not promise
    // B1's shape.
    await page.goto('/');
    await page.getByRole('tab', { name: 'B2' }).click();
    await expect(page.locator('.sprech__einstieg')).toContainText('zwei Themen zur Wahl');
    await expect(page.locator('.sprech__einstieg')).toContainText('Debatte');
    await page.getByRole('tab', { name: 'B1' }).click();
    await expect(page.locator('.sprech__einstieg')).not.toContainText('Debatte');
  });

  test('pages between tasks and stops at the ends', async ({ page }) => {
    await oeffnen(page, 'B2');
    await page.locator('.sprech__eintrag').first().click();
    await expect(page.getByRole('button', { name: /← Aufgabe/ })).toBeDisabled();
    await page.getByRole('button', { name: /Aufgabe 2 →/ }).click();
    await expect(page.locator('.sprech__kopf h2')).toHaveText(b2.aufgaben[1]!.kurz);
    await expect(page.getByRole('button', { name: /← Aufgabe 1/ })).toBeEnabled();
  });

  test('searches by topic and by vocabulary', async ({ page }) => {
    await oeffnen(page, 'B2');
    await page.getByPlaceholder('Thema oder Wort suchen …').fill('Tarif');
    const treffer = await page.locator('.sprech__eintrag').count();
    expect(treffer).toBeGreaterThan(0);
    expect(treffer).toBeLessThan(50);
    await page.getByPlaceholder('Thema oder Wort suchen …').fill('xyzzy');
    await expect(page.locator('.sprech__eintrag')).toHaveCount(0);
  });
});

test.describe('Sprechtraining B1', () => {
  test('opens a task on the task, not on the answers', async ({ page }) => {
    // A model answer read before speaking is a text you agree with rather than
    // something you produced, so the card must not open on it.
    await oeffnen(page, 'B1');
    await page.locator('.sprech__eintrag').first().click();

    const erste = b1.aufgaben[0]!;
    await expect(page.locator('.sprech__kopf h2')).toHaveText(erste.teil2.titel);
    await expect(page.locator('.situation')).toHaveText(erste.teil1.situation);
    await expect(page.locator('.sprech__punkte').first().locator('li')).toHaveCount(5);

    const html = await page.content();
    expect(html).not.toContain(erste.teil2.musterloesung[0]!.slice(0, 60));
    expect(html).not.toContain(erste.teil2.kultur.de.slice(0, 60));
  });

  test('shows the context and the timed model answer on request', async ({ page }) => {
    await oeffnen(page, 'B1');
    await page.locator('.sprech__eintrag').first().click();
    const erste = b1.aufgaben[0]!;

    await page.getByRole('tab', { name: 'So ist es in Deutschland' }).click();
    await expect(page.locator('.kulturkasten')).toContainText(
      erste.teil2.kultur.de.slice(0, 60),
    );
    await expect(page.locator('.sprech__wortschatz tr')).toHaveCount(
      erste.teil2.wortschatz.length,
    );

    await page.getByRole('tab', { name: 'Musterlösung' }).click();
    await expect(page.locator('.sprech__folie')).toHaveCount(5);
    await expect(page.locator('.sprech__umfang')).toContainText(
      `${erste.teil2.umfang.woerter} Wörter`,
    );
  });
});

test.describe('Sprechtraining B2', () => {
  const erste = b2.aufgaben[0]!;

  test('opens on the choice of two topics and the debate, without answers', async ({
    page,
  }) => {
    await oeffnen(page, 'B2');
    await page.locator('.sprech__eintrag').first().click();

    // The choice is the task: both offered topics are on the card.
    await expect(page.locator('.sprech__wahl')).toHaveCount(2);
    for (const [i, t] of erste.teil1.themen.entries()) {
      await expect(page.locator('.sprech__wahl').nth(i)).toContainText(t.titel);
    }
    // A four-point outline, not B1's five slides.
    await expect(page.locator('.sprech__punkte').first().locator('li')).toHaveCount(4);
    await expect(page.locator('.sprech__thema')).toHaveText(erste.teil2.frage);
    await expect(page.locator('.sprech__punkte').nth(1).locator('li')).toHaveCount(4);

    const html = await page.content();
    for (const t of erste.teil1.themen) {
      expect(html).not.toContain(t.musterloesung[0]!.slice(0, 60));
      expect(html).not.toContain(t.kultur.de.slice(0, 60));
    }
    expect(html).not.toContain(erste.teil2.musterdialog[0]!.text.slice(0, 60));
  });

  test('shows a culture note for each offered topic and for the debate', async ({
    page,
  }) => {
    // Three notes, not one: a candidate who picks topic 2 needs its context
    // just as much, and the debate has its own.
    await oeffnen(page, 'B2');
    await page.locator('.sprech__eintrag').first().click();
    await page.getByRole('tab', { name: 'So ist es in Deutschland' }).click();

    await expect(page.locator('.kulturkasten')).toHaveCount(3);
    for (const t of erste.teil1.themen) {
      await expect(page.locator('.sprech__inhalt')).toContainText(
        t.kultur.de.slice(0, 60),
      );
    }
    await expect(page.locator('.sprech__inhalt')).toContainText(
      erste.teil2.kultur.de.slice(0, 60),
    );
    // Eight words per topic, so sixteen rows.
    await expect(page.locator('.sprech__wortschatz tr')).toHaveCount(16);
  });

  test('shows both model talks timed to four minutes, the questions, and the debate', async ({
    page,
  }) => {
    await oeffnen(page, 'B2');
    await page.locator('.sprech__eintrag').first().click();
    await page.getByRole('tab', { name: 'Musterlösung' }).click();

    // Two talks of four blocks each.
    await expect(page.locator('.sprech__folie')).toHaveCount(8);
    for (const [i, t] of erste.teil1.themen.entries()) {
      await expect(page.locator('.sprech__inhalt')).toContainText(
        t.musterloesung[0]!.slice(0, 60),
      );
      await expect(page.locator('.sprech__umfang').nth(i)).toContainText(
        `${t.umfang.woerter} Wörter`,
      );
      // 400-500 words at 110 a minute is 3:38 to 4:33 — inside "ca. 4 Minuten".
      expect(t.umfang.sprechzeitSekunden).toBeGreaterThanOrEqual(218);
      expect(t.umfang.sprechzeitSekunden).toBeLessThanOrEqual(273);
    }
    // The debate is timed for two speakers, so it carries no minutes of its own.
    await expect(page.locator('.sprech__umfang').nth(2)).toContainText(
      `${erste.teil2.umfang.woerter} Wörter zu zweit`,
    );
    // The examiner's three questions with their answers, then the debate.
    for (const f of erste.teil1.fragen) {
      await expect(page.locator('.sprech__inhalt')).toContainText(f);
    }
    await expect(page.locator('.sprech__inhalt')).toContainText(
      erste.teil2.musterdialog[0]!.text.slice(0, 60),
    );
  });
});
