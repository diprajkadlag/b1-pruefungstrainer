import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  alleFragen,
  leererFortschritt,
  rundeBauen,
  type Frage,
  type Kategorie,
  type Lernhilfe,
  type Stufe,
} from '@pruefung/core';

/**
 * End-to-end for Sprachschatz.
 *
 * The question engine is unit-tested in `packages/core`, so this file does not
 * re-check what a good question looks like. It covers what only a real browser
 * can answer: that the game reaches every level, that a whole round can be
 * played, that the article colours actually arrive on screen, that the
 * scoreboard survives a reload, and that a corrupt one does not brick it.
 *
 * Playing a round means knowing the answers. Rather than writing them into the
 * page for the test to read — which would put every answer one devtools click
 * away for a learner too — the round is pinned with `?saat=` and rebuilt here
 * from the same public data and the same engine the app uses. If the app and
 * this file ever disagree about what round a seed produces, the test fails,
 * which is the right outcome.
 */

const SAAT = 20260820;

function lernhilfeVonPlatte(stufe: Stufe): Lernhilfe {
  const datei =
    stufe === 'B1' ? 'lernhilfe.json' : `lernhilfe-${stufe.toLowerCase()}.json`;
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../public/content/${datei}`, import.meta.url)),
      'utf-8',
    ),
  ) as Lernhilfe;
}

/** The exact round the app will deal for this level, category and seed. */
function rundeVorhersagen(stufe: Stufe, kategorie: Kategorie): Frage[] {
  const lh = lernhilfeVonPlatte(stufe);
  return rundeBauen(
    alleFragen(lh, kategorie, lh.titel.length),
    leererFortschritt(),
    SAAT,
  );
}

async function spielOeffnen(page: Page, stufe: Stufe) {
  await page.goto(`/?saat=${SAAT}`);
  await page.getByRole('tab', { name: stufe }).click();
  await page.getByRole('button', { name: /Spiel starten/ }).click();
  await page.locator('.kachel').first().waitFor();
}

async function rundeStarten(page: Page, stufe: Stufe, kategorie: Kategorie) {
  const knopf = kategorie === 'gemischt' ? /Alles gemischt/ : new RegExp(kategorie, 'i');
  await spielOeffnen(page, stufe);
  await page.getByRole('button', { name: knopf }).click();
  await page.locator('.karte-spiel').waitFor();
}

/**
 * Wait for the card to turn over on its own.
 *
 * Never a fixed sleep: the pause between cards is a product decision that has
 * already moved once, and a test that hard-codes it silently starts clicking
 * into the previous card the moment it changes again.
 */
async function naechsteKarte(page: Page, fertig: number) {
  await expect(page.locator('.pfad__halt--fertig')).toHaveCount(fertig, {
    timeout: 15_000,
  });
}

async function beantworten(page: Page, frage: Frage, richtig: boolean) {
  if (frage.art === 'bauen') {
    const woerter = richtig ? frage.loesung.split(' ') : [...frage.optionen].reverse();
    for (const w of woerter)
      await page
        .locator('.chip')
        .filter({ hasText: new RegExp(`^${w}$`) })
        .first()
        .click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    return;
  }
  const wahl = richtig ? frage.loesung : frage.optionen.find((o) => o !== frage.loesung)!;
  await page
    .locator('.option')
    .filter({ hasText: new RegExp(`^${wahl}$`) })
    .first()
    .click();
}

test.describe('Sprachschatz', () => {
  test('opens from the start screen at every level', async ({ page }) => {
    for (const stufe of ['A1', 'A2', 'B1', 'B2'] as Stufe[]) {
      await spielOeffnen(page, stufe);
      await expect(page.getByRole('heading', { name: /Sprachschatz/ })).toBeVisible();
      await expect(page.locator('.spiel__stufe')).toHaveText(stufe);
    }
  });

  test('offers the three practice areas plus the mixed one', async ({ page }) => {
    await spielOeffnen(page, 'B1');
    await expect(page.locator('.kachel')).toHaveCount(4);
    for (const name of ['Wortschatz', 'Grammatik', 'Redemittel', 'Alles gemischt'])
      await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  });

  test('every area has enough cards for a full round, at every level', async ({
    page,
  }) => {
    for (const stufe of ['A1', 'A2', 'B1', 'B2'] as Stufe[]) {
      await spielOeffnen(page, stufe);
      const texte = await page.locator('.kachel__fuss').allTextContents();
      expect(texte).toHaveLength(4);
      for (const t of texte)
        expect(Number(t.match(/(\d+) Karten/)![1])).toBeGreaterThanOrEqual(12);
    }
  });

  test('deals twelve cards and three lives', async ({ page }) => {
    await rundeStarten(page, 'B1', 'wortschatz');
    await expect(page.locator('.pfad__halt')).toHaveCount(12);
    await expect(page.locator('.herz')).toHaveCount(3);
    await expect(page.locator('.herz--weg')).toHaveCount(0);
  });

  test('deals the round its seed promises', async ({ page }) => {
    await rundeStarten(page, 'B1', 'wortschatz');
    const erwartet = rundeVorhersagen('B1', 'wortschatz')[0]!;
    await expect(page.locator('.karte-spiel__frage')).toHaveText(erwartet.frage);
  });

  test('never puts the answer on screen before it is asked for', async ({ page }) => {
    await rundeStarten(page, 'B1', 'wortschatz');
    const erwartet = rundeVorhersagen('B1', 'wortschatz')[0]!;

    await expect(page.locator('.rueckmeldung')).toHaveCount(0);
    await expect(page.locator('.option--richtig')).toHaveCount(0);
    // The reason names the answer, so it must not be in the page yet.
    expect(await page.content()).not.toContain(erwartet.erklaerung);
  });

  test('scores a right answer, explains it, and moves on by itself', async ({ page }) => {
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, rundeVorhersagen('B1', 'wortschatz')[0]!, true);

    await expect(page.locator('.karte-spiel--gut')).toBeVisible();
    await expect(page.locator('.rueckmeldung')).toContainText('Richtig.');
    await expect(page.locator('.punktestand__zahl')).toHaveText('10');
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(1, { timeout: 5000 });
  });

  test('costs a life on a wrong answer and shows what was right', async ({ page }) => {
    await rundeStarten(page, 'B1', 'wortschatz');
    const frage = rundeVorhersagen('B1', 'wortschatz')[0]!;
    await beantworten(page, frage, false);

    await expect(page.locator('.karte-spiel--schlecht')).toBeVisible();
    await expect(page.locator('.rueckmeldung')).toContainText(frage.loesung);
    await expect(page.locator('.herz--weg')).toHaveCount(1);
    await expect(page.locator('.punktestand__zahl')).toHaveText('0');
  });

  test('builds a streak that multiplies the points', async ({ page }) => {
    // 10 for the first, 20 for the second, 30 for the third.
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');

    for (let i = 0; i < 3; i++) {
      await beantworten(page, runde[i]!, true);
      await expect(page.locator('.pfad__halt--fertig')).toHaveCount(i + 1, {
        timeout: 5000,
      });
    }
    await expect(page.locator('.punktestand__zahl')).toHaveText('60');
    await expect(page.locator('.serie')).toContainText('3');
  });

  test('breaking a streak stops the multiplier', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');

    await beantworten(page, runde[0]!, true);
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(1, { timeout: 5000 });
    await beantworten(page, runde[1]!, false);
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(2, { timeout: 6000 });
    await beantworten(page, runde[2]!, true);

    // 10, then nothing, then 10 again — not 30.
    await expect(page.locator('.punktestand__zahl')).toHaveText('20');
  });

  test('colours der, die and das apart', async ({ page }) => {
    // The one memory device the whole game is built around. If these three
    // ever render in the same colour the point of it is gone.
    const runde = rundeVorhersagen('A1', 'wortschatz');
    const wo = runde.findIndex((f) => f.art === 'artikel');
    expect(wo).toBeGreaterThanOrEqual(0);

    await rundeStarten(page, 'A1', 'wortschatz');
    for (let i = 0; i < wo; i++) {
      await beantworten(page, runde[i]!, true);
      await expect(page.locator('.pfad__halt--fertig')).toHaveCount(i + 1, {
        timeout: 5000,
      });
    }

    const optionen = page.locator('.optionen--artikel .option');
    await expect(optionen).toHaveCount(3);
    await expect(optionen).toHaveText(['der', 'die', 'das']);
    const farben = await optionen.evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).color),
    );
    expect(new Set(farben).size).toBe(3);
  });

  test('plays a whole round to the end', async ({ page }) => {
    // Twelve cards at roughly three seconds of reading time each: the default
    // per-test budget is not enough, and raising it here is honest about why.
    test.setTimeout(120_000);
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');

    for (const [i, frage] of runde.entries()) {
      await beantworten(page, frage, true);
      // The last card ends the round rather than advancing the path.
      if (i < runde.length - 1) await naechsteKarte(page, i + 1);
    }

    await expect(page.getByRole('heading', { name: 'Alles richtig!' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Noch eine Runde' })).toBeVisible();
    // 10+20+30+40 then 50 for the rest: 100 + 8x50.
    await expect(page.locator('.bilanz dd').first()).toHaveText('500');
  });

  test('ends the round when the third life goes', async ({ page }) => {
    const runde = rundeVorhersagen('B2', 'wortschatz');
    await rundeStarten(page, 'B2', 'wortschatz');

    for (let i = 0; i < 3; i++) {
      await beantworten(page, runde[i]!, false);
      // A wrong answer still advances the path; the third one ends the round.
      if (i < 2) await naechsteKarte(page, i + 1);
    }
    await expect(page.getByRole('heading', { name: 'Runde vorbei' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('keeps each level and area on its own scoreboard', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem(
        'sprachschatz:B1:wortschatz',
        JSON.stringify({ boxen: {}, bestePunkte: 420, besteSerie: 7, gespielt: 3 }),
      ),
    );

    await spielOeffnen(page, 'B1');
    await expect(page.locator('.kachel--wortschatz')).toContainText('Bestwert 420');

    await page.getByRole('button', { name: /Zurück/ }).click();
    await page.getByRole('tab', { name: 'A2' }).click();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await expect(page.locator('.kachel--wortschatz')).not.toContainText('Bestwert');
  });

  test('remembers a finished round after a reload', async ({ page }) => {
    test.setTimeout(120_000);
    const runde = rundeVorhersagen('A2', 'grammatik');
    await rundeStarten(page, 'A2', 'grammatik');
    for (const [i, frage] of runde.entries()) {
      await beantworten(page, frage, true);
      if (i < runde.length - 1) await naechsteKarte(page, i + 1);
    }
    await expect(page.getByRole('heading', { name: 'Alles richtig!' })).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await page.getByRole('tab', { name: 'A2' }).click();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await expect(page.locator('.kachel--grammatik')).toContainText('Bestwert');
  });

  test('survives a corrupt scoreboard instead of failing to open', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.setItem('sprachschatz:B1:gemischt', '{ not json at all'),
    );
    await spielOeffnen(page, 'B1');
    await expect(page.locator('.kachel--gemischt')).toBeVisible();
    await page.getByRole('button', { name: /Alles gemischt/ }).click();
    await expect(page.locator('.karte-spiel')).toBeVisible();
  });
});
