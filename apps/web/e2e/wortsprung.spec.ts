import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  alleFragen,
  leererFortschritt,
  rundeBauen,
  verlaufSchluessel,
  type Frage,
  type Lernhilfe,
} from '@pruefung/core';
import { farben, kontrast, oeffnen } from './hilfe';

/**
 * End-to-end: Wortsprung, the platformer over the Sprachschatz cards.
 *
 * The round is pinned with `?saat=`, and the test rebuilds it from the same
 * cheat sheet the app reads, so it knows which box is the right one without
 * the page ever having to say. Answers are given the way a thumb gives them:
 * tap the label, the hero runs there and jumps. What is asserted is what a
 * learner would notice — the coin card, the lost heart, the shared history —
 * not the pixels.
 */

const SAAT = 20260820;

const lh = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../public/content/lernhilfe.json', import.meta.url)),
    'utf-8',
  ),
) as Lernhilfe;

const runde: Frage[] = rundeBauen(
  alleFragen(lh, 'gemischt', lh.titel.length).filter((f) => f.art !== 'bauen'),
  leererFortschritt(),
  SAAT,
);

async function zumSpiel(page: Page) {
  await oeffnen(page, 'B1', 'online', `/?saat=${SAAT}`);
  await page.getByRole('button', { name: /Spiele/ }).click();
  await page.getByRole('button', { name: /Wortsprung/ }).click();
  await page.getByRole('button', { name: /Alles gemischt/ }).click();
  await page.locator('.ws__buehne').waitFor();
}

function etikett(page: Page, text: string) {
  return page.locator('.ws__buehne').getByRole('button', { name: text, exact: true });
}

async function falscheOption(nr: number): Promise<string> {
  const f = runde[nr]!;
  return f.optionen.find((o) => o !== f.loesung)!;
}

test.describe('Spiele', () => {
  test('the shelf offers both games over the same cards', async ({ page }) => {
    await oeffnen(page, 'B1');
    await page.getByRole('button', { name: /Spiele/ }).click();
    await expect(page.getByRole('heading', { name: 'Spiele B1' })).toBeVisible();
    await expect(page.locator('.spielkarte')).toHaveCount(2);

    await page.getByRole('button', { name: /Sprachschatz/ }).click();
    await expect(page.locator('.kachel').first()).toBeVisible();
    await page.goBack().catch(() => undefined);
  });
});

test.describe('Wortsprung', () => {
  test('opens on the first station with every option on the field', async ({ page }) => {
    await zumSpiel(page);
    const erste = runde[0]!;
    await expect(page.locator('.ws__frage strong')).toHaveText(erste.frage);
    await expect(page.locator('.ws__etikett')).toHaveCount(erste.optionen.length);
    for (const o of erste.optionen) await expect(etikett(page, o)).toBeVisible();
    await expect(page.locator('.leben__voll')).toHaveCount(3);
    await expect(page.locator('.ws__pfad')).toHaveText(`1/${runde.length}`);
    // Nothing gives the answer away before it is given.
    await expect(page.locator('.ws__etikett--richtig')).toHaveCount(0);
    await expect(page.locator('.ws__karte')).toHaveCount(0);
  });

  test('never deals a word-order card, which has nothing to jump on', () => {
    expect(runde.some((f) => f.art === 'bauen')).toBe(false);
    expect(runde).toHaveLength(12);
  });

  test('the hero runs to the tapped box, jumps, and the right one rings', async ({
    page,
  }) => {
    await zumSpiel(page);
    const erste = runde[0]!;
    await etikett(page, erste.loesung).click();
    const karte = page.locator('.ws__karte--richtig');
    await expect(karte).toBeVisible({ timeout: 15_000 });
    await expect(karte).toContainText('Richtig!');
    await expect(karte).toContainText(erste.erklaerung.slice(0, 40));
    await expect(page.locator('.leben__voll')).toHaveCount(3);
    await expect(page.locator('.punktestand__zahl').first()).not.toHaveText('0');

    await page.getByRole('button', { name: /Weiter/ }).click();
    await expect(page.locator('.ws__pfad')).toHaveText(`2/${runde.length}`);
    await expect(page.locator('.ws__frage strong')).toHaveText(runde[1]!.frage);
  });

  test('the wrong one costs a heart and shows the right answer', async ({ page }) => {
    await zumSpiel(page);
    const erste = runde[0]!;
    await etikett(page, await falscheOption(0)).click();
    const karte = page.locator('.ws__karte--falsch');
    await expect(karte).toBeVisible({ timeout: 15_000 });
    await expect(karte).toContainText('Leider falsch');
    await expect(karte).toContainText(erste.loesung);
    await expect(page.locator('.leben__voll')).toHaveCount(2);
    // The right box is now shown as such, so the lesson is not lost.
    await expect(page.locator('.ws__etikett--richtig')).toContainText(erste.loesung);
  });

  test('space bar closes the card, like Weiter', async ({ page }) => {
    await zumSpiel(page);
    await etikett(page, runde[0]!.loesung).click();
    await expect(page.locator('.ws__karte')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Space');
    await expect(page.locator('.ws__pfad')).toHaveText(`2/${runde.length}`);
  });

  test('a miss lands in the same history Sprachschatz reads', async ({ page }) => {
    await zumSpiel(page);
    const erste = runde[0]!;
    await etikett(page, await falscheOption(0)).click();
    await expect(page.locator('.ws__karte')).toBeVisible({ timeout: 15_000 });

    const verlauf = await page.evaluate(
      (k) =>
        JSON.parse(localStorage.getItem(k) ?? '[]') as { id: string; richtig: boolean }[],
      verlaufSchluessel('B1'),
    );
    expect(verlauf.some((n) => n.id === erste.id && n.richtig === false)).toBe(true);
  });

  test('three misses end the round with the hearts gone', async ({ page }) => {
    test.setTimeout(90_000);
    await zumSpiel(page);
    for (let i = 0; i < 3; i++) {
      await etikett(page, await falscheOption(i)).click();
      await expect(page.locator('.ws__karte--falsch')).toBeVisible({ timeout: 15_000 });
      if (i < 2) await page.getByRole('button', { name: /Weiter/ }).click();
    }
    await page.getByRole('button', { name: /Zum Ergebnis/ }).click();
    await expect(page.getByRole('heading', { name: 'Alle Herzen weg' })).toBeVisible();
    // What went wrong is listed, with the right answer, so the round taught.
    await expect(page.locator('.ws__fehler li')).toHaveCount(3);
  });

  test('a clean run reaches the end and keeps the record', async ({ page }) => {
    test.setTimeout(180_000);
    await zumSpiel(page);
    for (let i = 0; i < runde.length; i++) {
      await expect(page.locator('.ws__pfad')).toHaveText(`${i + 1}/${runde.length}`);
      await etikett(page, runde[i]!.loesung).click();
      await expect(page.locator('.ws__karte--richtig')).toBeVisible({ timeout: 20_000 });
      await page
        .getByRole('button', { name: i + 1 < runde.length ? /Weiter/ : /Zum Ergebnis/ })
        .click();
    }
    await expect(page.getByRole('heading', { name: 'Ziel erreicht!' })).toBeVisible();
    await expect(page.locator('.ws__fehler')).toHaveCount(0);
    await expect(page.getByText(/12 richtig, 0 falsch/)).toBeVisible();

    // Back on the shelf, the record shows.
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.locator('.spielkarte__rekord')).toBeVisible();
  });

  test('has thumb controls on every device', async ({ page }) => {
    await zumSpiel(page);
    await expect(page.getByRole('button', { name: 'nach links' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'nach rechts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'springen' })).toBeVisible();
  });
});

test.describe('Wortsprung bei Tag und Nacht', () => {
  for (const schema of ['light', 'dark'] as const) {
    test(`keeps its daylight ink in ${schema} mode, so every option can be read`, async ({
      page,
    }) => {
      // The stage is a picture of a sunny day; the labels on it are white
      // cards. In dark mode the page's text goes pale, and the first release
      // let that pale text onto the white cards — the options were there,
      // and could not be seen.
      await page.emulateMedia({ colorScheme: schema });
      await zumSpiel(page);

      // The page follows the scheme; the stage must not.
      const seite = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      expect(seite).toBe(schema === 'dark' ? 'rgb(18, 22, 27)' : 'rgb(255, 255, 255)');

      const etiketten = await page.locator('.ws__etikett').evaluateAll((els) =>
        els.map((el) => {
          const s = getComputedStyle(el);
          return { text: el.textContent ?? '', farbe: s.color, grund: s.backgroundColor };
        }),
      );
      expect(etiketten.length).toBeGreaterThan(1);
      const HIMMEL = [191, 224, 255];
      for (const e of etiketten) {
        expect(kontrast(e.farbe, e.grund, HIMMEL), e.text).toBeGreaterThanOrEqual(4.5);
      }

      // The jump button sits outside the stage and follows the page.
      const sprung = page.getByRole('button', { name: 'springen' });
      const s = await farben(sprung);
      expect(kontrast(s.farbe, s.grund)).toBeGreaterThanOrEqual(3);

      // The verdict card too: the explanation, the right answer in the
      // level's colour, and the button that closes it.
      await etikett(page, await falscheOption(0)).click();
      const karte = page.locator('.ws__karte--falsch');
      await expect(karte).toBeVisible({ timeout: 15_000 });
      const k = await karte.evaluate((el) => {
        const farbe = (e: Element | null) => getComputedStyle(e!).color;
        const grund = (e: Element | null) => getComputedStyle(e!).backgroundColor;
        const knopf = el.querySelector('button');
        return {
          grund: grund(el),
          text: farbe(el.querySelector('p')),
          loesung: farbe(el.querySelector('em')),
          knopfText: farbe(knopf),
          knopfGrund: grund(knopf),
        };
      });
      expect(kontrast(k.text, k.grund)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(k.loesung, k.grund)).toBeGreaterThanOrEqual(3);
      expect(kontrast(k.knopfText, k.knopfGrund)).toBeGreaterThanOrEqual(3);

      // Hovered too: the button reads the page's --bg for its label there.
      const weiter = karte.getByRole('button', { name: /Weiter/ });
      await weiter.hover();
      const h = await farben(weiter);
      expect(kontrast(h.farbe, h.grund)).toBeGreaterThanOrEqual(3);
    });
  }
});
