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
 * Move to the next card the way a learner does, by clicking Weiter.
 *
 * Never a fixed sleep, and never waiting out the auto-advance either: that is
 * now scaled to the length of the explanation and runs to sixteen seconds on a
 * grammar card, so a twelve-card round would spend three minutes waiting. The
 * button is faster and tests the control that actually matters.
 */
async function naechsteKarte(page: Page, fertig: number) {
  await page.locator('.weiter').click();
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
    // Left alone, the card still turns over by itself.
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(1, { timeout: 20_000 });
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
      await naechsteKarte(page, i + 1);
    }
    await expect(page.locator('.punktestand__zahl')).toHaveText('60');
    await expect(page.locator('.serie')).toContainText('3');
  });

  test('breaking a streak stops the multiplier', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');

    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);
    await beantworten(page, runde[1]!, false);
    await naechsteKarte(page, 2);
    await beantworten(page, runde[2]!, true);

    // 10, then nothing, then 10 again — not 30.
    await expect(page.locator('.punktestand__zahl')).toHaveText('20');
  });

  test('offers Weiter only once the card is answered', async ({ page }) => {
    await rundeStarten(page, 'B1', 'wortschatz');
    await expect(page.locator('.weiter')).toHaveCount(0);

    await beantworten(page, rundeVorhersagen('B1', 'wortschatz')[0]!, true);
    await expect(page.locator('.weiter')).toBeVisible();
  });

  test('Weiter moves on immediately, without a second advance behind it', async ({
    page,
  }) => {
    // The button and the timer both advance the round. If clicking Weiter did
    // not cancel the pending timer, the card after it would be skipped a
    // second or two later — and the learner would never see it.
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, true);

    await page.locator('.weiter').click();
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(1);
    await expect(page.locator('.karte-spiel__frage')).toHaveText(runde[1]!.frage);

    // Well past the pause the cancelled timer would have fired at.
    await page.waitForTimeout(9000);
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(1);
    await expect(page.locator('.karte-spiel__frage')).toHaveText(runde[1]!.frage);
  });

  test('marks answered stations as the way back, and unanswered ones not', async ({
    page,
  }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await expect(page.locator('button.pfad__halt')).toHaveCount(0);

    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);
    await beantworten(page, runde[1]!, true);
    await naechsteKarte(page, 2);

    // Two answered, ten still to come.
    await expect(page.locator('button.pfad__halt')).toHaveCount(2);
    await expect(page.locator('.pfad__halt')).toHaveCount(12);
  });

  test('reopens an answered card with its explanation', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);

    await page.locator('button.pfad__halt').first().click();
    const schau = page.locator('.schau');
    await expect(schau).toBeVisible();
    await expect(schau.locator('.karte-spiel__frage')).toHaveText(runde[0]!.frage);
    await expect(schau).toContainText(runde[0]!.erklaerung.split('\n')[0]!);
    await expect(schau).toContainText(runde[0]!.loesung);
    // Reading, not re-answering: the live card is out of the way and there is
    // nothing here to click an answer with.
    await expect(page.locator('.option')).toHaveCount(0);
  });

  test('shows a wrong answer next to the right one', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    const falsch = runde[0]!.optionen.find((o) => o !== runde[0]!.loesung)!;
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, false);
    await naechsteKarte(page, 1);

    await page.locator('button.pfad__halt').first().click();
    await expect(page.locator('.schau--daneben')).toBeVisible();
    await expect(page.locator('.schau__antworten')).toContainText(falsch);
    await expect(page.locator('.schau__antworten')).toContainText(runde[0]!.loesung);
  });

  test('looking back does not move the round on behind you', async ({ page }) => {
    // The failure this prevents: you answer, step back to read the last card,
    // and the pending auto-advance quietly carries the round forward while you
    // are not looking — so you lose your place in the act of keeping it.
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);
    await beantworten(page, runde[1]!, true);

    await page.locator('button.pfad__halt').first().click();
    await page.waitForTimeout(9000); // well past any pause that was pending
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(2);

    await page.getByRole('button', { name: 'Zurück zur Runde' }).click();
    // Back on the card that was open, still answered, still waiting.
    await expect(page.locator('.karte-spiel__frage')).toHaveText(runde[1]!.frage);
    await expect(page.locator('.weiter')).toBeVisible();
  });

  test('looking back changes neither the score nor the lives', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);

    await page.locator('button.pfad__halt').first().click();
    await page.locator('button.pfad__halt').first().click();
    await page.getByRole('button', { name: 'Zurück zur Runde' }).click();

    await expect(page.locator('.punktestand__zahl')).toHaveText('10');
    await expect(page.locator('.herz--weg')).toHaveCount(0);
  });

  test('pages through the cards already answered', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    for (let i = 0; i < 3; i++) {
      await beantworten(page, runde[i]!, true);
      await naechsteKarte(page, i + 1);
    }

    await page.locator('button.pfad__halt').first().click();
    await expect(page.getByRole('button', { name: /Vorige/ })).toBeDisabled();

    await page.getByRole('button', { name: /Nächste/ }).click();
    await expect(page.locator('.schau .karte-spiel__frage')).toHaveText(runde[1]!.frage);
    await page.getByRole('button', { name: /Nächste/ }).click();
    await expect(page.locator('.schau .karte-spiel__frage')).toHaveText(runde[2]!.frage);
    // Three answered, so there is nothing after the third.
    await expect(page.getByRole('button', { name: /Nächste/ })).toBeDisabled();

    await page.getByRole('button', { name: /Vorige/ }).click();
    await expect(page.locator('.schau .karte-spiel__frage')).toHaveText(runde[1]!.frage);
  });

  test('lists the whole round at the end, with every reason', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    for (const [i, frage] of runde.entries()) {
      await beantworten(page, frage, true);
      if (i < runde.length - 1) await naechsteKarte(page, i + 1);
      else await page.locator('.weiter').click();
    }

    await expect(page.locator('.durchsicht details')).toHaveCount(12);
    const erste = page.locator('.durchsicht details').first();
    await expect(erste).toContainText(runde[0]!.frage);
    // Collapsed until asked for, so the summary stays readable.
    await erste.locator('summary').click();
    await expect(erste).toContainText(runde[0]!.erklaerung.split('\n')[0]!);
  });

  test('keeps answers after the round is over and the page reloaded', async ({
    page,
  }) => {
    // The point of the whole feature: a card answered in an earlier session is
    // still there to be looked up.
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    for (let i = 0; i < 3; i++) {
      await beantworten(page, runde[i]!, i !== 1);
      await naechsteKarte(page, i + 1);
    }

    await page.reload();
    await page.getByRole('button', { name: /Spiel starten/ }).click();

    const verlauf = page.locator('.verlauf');
    await expect(verlauf).toBeVisible();
    await expect(verlauf.locator('details')).toHaveCount(3);
    await expect(verlauf).toContainText('3 beantwortet');
    await expect(verlauf).toContainText('1 falsch');
    // Newest first.
    await expect(verlauf.locator('details').first()).toContainText(runde[2]!.frage);
  });

  test('rebuilds the explanation from the content, not from what was stored', async ({
    page,
  }) => {
    // Only the record is kept, so the reason has to come back from the cheat
    // sheet. If it did not, the history would show empty rows.
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, false);
    await naechsteKarte(page, 1);

    await page.reload();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    const erste = page.locator('.verlauf details').first();
    await erste.locator('summary').click();
    await expect(erste).toContainText(runde[0]!.erklaerung.split('\n')[0]!);
    await expect(erste).toContainText(runde[0]!.loesung);
  });

  test('filters the history down to the ones that went wrong', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    for (let i = 0; i < 4; i++) {
      await beantworten(page, runde[i]!, i % 2 === 0);
      await naechsteKarte(page, i + 1);
    }

    await page.reload();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await expect(page.locator('.verlauf details')).toHaveCount(4);

    await page.getByText('Nur die falschen zeigen').click();
    await expect(page.locator('.verlauf details')).toHaveCount(2);
  });

  test('clears the history when asked, and stays cleared', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);

    await page.reload();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await page.getByRole('button', { name: 'Verlauf löschen' }).click();
    await expect(page.locator('.verlauf')).toHaveCount(0);

    await page.reload();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await expect(page.locator('.verlauf')).toHaveCount(0);
  });

  test('keeps one level’s history away from another’s', async ({ page }) => {
    const runde = rundeVorhersagen('B1', 'wortschatz');
    await rundeStarten(page, 'B1', 'wortschatz');
    await beantworten(page, runde[0]!, true);
    await naechsteKarte(page, 1);

    await page.reload();
    await page.getByRole('tab', { name: 'A2' }).click();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await expect(page.locator('.verlauf')).toHaveCount(0);

    await page.getByRole('button', { name: /Zurück/ }).click();
    await page.getByRole('tab', { name: 'B1' }).click();
    await page.getByRole('button', { name: /Spiel starten/ }).click();
    await expect(page.locator('.verlauf details')).toHaveCount(1);
  });

  test('shrugs off a corrupt history rather than failing to open', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('sprachschatz:verlauf:B1', '{ not an array at all');
    });
    await spielOeffnen(page, 'B1');
    await expect(page.locator('.kachel')).toHaveCount(4);
    await expect(page.locator('.verlauf')).toHaveCount(0);
  });

  test('drops a history entry whose card no longer exists', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'sprachschatz:verlauf:B1',
        JSON.stringify([
          {
            id: 'artikel:GibtesNichtMehr',
            kategorie: 'wortschatz',
            antwort: 'der',
            richtig: false,
            zeit: 2,
          },
          {
            id: 'artikel:Vorteil',
            kategorie: 'wortschatz',
            antwort: 'der',
            richtig: true,
            zeit: 1,
          },
        ]),
      );
    });
    await spielOeffnen(page, 'B1');
    // Both are counted — they were answered — but only the one still in the
    // content can be shown.
    await expect(page.locator('.verlauf')).toContainText('2 beantwortet');
    await expect(page.locator('.verlauf details')).toHaveCount(1);
    await expect(page.locator('.verlauf details')).toContainText('Vorteil');
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
      await naechsteKarte(page, i + 1);
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
      if (i < runde.length - 1) await naechsteKarte(page, i + 1);
      // The last Weiter ends the round rather than advancing the path.
      else await page.locator('.weiter').click();
    }

    await expect(page.getByRole('heading', { name: 'Alles richtig!' })).toBeVisible();
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
      else await page.locator('.weiter').click();
    }
    await expect(page.getByRole('heading', { name: 'Runde vorbei' })).toBeVisible();
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
      else await page.locator('.weiter').click();
    }
    await expect(page.getByRole('heading', { name: 'Alles richtig!' })).toBeVisible();

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
