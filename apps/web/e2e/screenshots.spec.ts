import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { alleFragen, leererFortschritt, rundeBauen } from '@pruefung/core';
import { ersterBesuch, oeffnen } from './hilfe';

/**
 * Not a test — this drives the app through its main screens and saves the
 * images the README uses, so the screenshots can never drift from the UI.
 *
 *   npx playwright test screenshots --update-snapshots
 *
 * Every shot starts from the B1 shelf on screen, which is where a returning
 * learner lands: the two entry questions are answered ahead of time, exactly
 * as the browser would answer them from its own memory. The README shows what
 * people spend their time on, not the two clicks they make once.
 */

const exam = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../content/exams/pruefung-01/exam.json', import.meta.url),
    ),
    'utf-8',
  ),
);
const OUT = fileURLToPath(new URL('../../../docs/screenshots/', import.meta.url));

test.use({ viewport: { width: 1180, height: 900 } });

/**
 * One shot, taken the same way every time: from the top of the page, and with
 * the fade-ins fast-forwarded. The game deals each card with a 0.28 s
 * animation, and without that a rebuild can commit a card caught halfway
 * through it — which is how the article colours came to be invisible in the
 * one image that exists to show them.
 */
async function schuss(page: Page, datei: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${OUT}${datei}`,
    fullPage: false,
    animations: 'disabled',
  });
}

test('Screenshots erzeugen', async ({ page }) => {
  // The front door first, since it is the one screen every learner meets and
  // the one place the level colours are all visible at once.
  await ersterBesuch(page);
  await page.getByRole('button', { name: /^B2/ }).waitFor();
  await schuss(page, '00-niveau.png');

  await oeffnen(page, 'B1');
  // The registry arrives over the network, and the paper list is the whole
  // point of this shot. Without the wait it is a race that gets slower to win
  // with every paper added — and loses silently, into a committed image.
  await page.getByRole('button', { name: /Übungsprüfung 1/ }).waitFor();
  await schuss(page, '01-start.png');

  await page.getByRole('button', { name: /Übungsprüfung 1/ }).click();
  for (const label of ['Hören', 'Schreiben', 'Sprechen']) {
    const box = page.getByRole('checkbox', { name: new RegExp(label) });
    if (await box.isChecked()) await box.click();
  }
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
  await page.locator('.lesetext').first().waitFor();
  await schuss(page, '02-lesen.png');

  // Answer most items correctly and leave a few blank, so the result screen
  // shows a realistic mixed score rather than a perfect or empty one.
  const items = exam.lesen.teile.flatMap(
    (t: { items: { nr: number; loesung: string }[] }) => t.items,
  );
  for (const [i, item] of items.entries()) {
    if (i % 6 === 0) continue;
    await page
      .locator(`input[name="item-${item.nr}"][value="${item.loesung}"]`)
      .check({ force: true });
  }
  // One module was chosen, so the closing button goes straight to the result.
  await page.getByRole('button', { name: /Auswertung ansehen/ }).click();
  await page.locator('.karte').first().waitFor();
  await schuss(page, '03-ergebnis.png');

  await page.getByRole('tab', { name: 'Lösungen' }).click();
  await page.locator('.loesung').first().waitFor();
  await schuss(page, '04-loesungen.png');

  await page.getByRole('tab', { name: 'Wortschatz' }).click();
  await page.locator('.glossartabelle').first().waitFor();
  await schuss(page, '05-glossar.png');

  await page.getByRole('tab', { name: 'Grammatik' }).click();
  await page.locator('.grammatikpunkt').first().waitFor();
  await schuss(page, '06-grammatik.png');
});

test('Spickzettel-Screenshots erzeugen', async ({ page }) => {
  await oeffnen(page, 'B1');
  await page.getByRole('button', { name: /Spickzettel/ }).click();

  await page.getByRole('tab', { name: 'Redemittel' }).click();
  await page.locator('.spick__karte').first().waitFor();
  await schuss(page, '07-spickzettel.png');

  await page.getByRole('tab', { name: 'Wortschatz' }).click();
  await page.locator('.spick__tabelle').first().waitFor();
  await schuss(page, '08-wortschatz.png');
});

test('Spiel-Screenshots erzeugen', async ({ page }) => {
  // Plays several cards to reach an article one, at reading speed.
  test.setTimeout(120_000);
  // Pinned seed, so the card in the README is the same card every time and a
  // rebuild does not produce a diff for no reason.
  await oeffnen(page, 'B1', 'online', '/?saat=20260820');
  await page.getByRole('button', { name: /Sprachschatz/ }).click();
  await page.locator('.kachel').first().waitFor();
  await schuss(page, '09-spiel.png');

  // Play forward to the first article card: the colour coding is the thing
  // worth showing, and it only appears on that kind of question. The answers
  // come from rebuilding the pinned round, because clicking blindly burns
  // three lives and ends the round before an article card ever comes up.
  const lh = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../public/content/lernhilfe.json', import.meta.url)),
      'utf-8',
    ),
  );
  const runde = rundeBauen(
    alleFragen(lh, 'wortschatz', lh.titel.length),
    leererFortschritt(),
    20260820,
  );

  await page.getByRole('button', { name: /Wortschatz/ }).click();
  await page.locator('.karte-spiel').waitFor();
  let erledigt = 0;
  for (const frage of runde) {
    if (frage.art === 'artikel') break;
    await page
      .locator('.option')
      .filter({ hasText: new RegExp(`^${frage.loesung}$`) })
      .first()
      .click();
    // Click on rather than waiting out the pause, which is scaled to the
    // length of the explanation and runs to sixteen seconds on a long card.
    await page.locator('.weiter').click();
    erledigt += 1;
    await expect(page.locator('.pfad__halt--fertig')).toHaveCount(erledigt, {
      timeout: 15_000,
    });
  }
  await schuss(page, '10-spiel-artikel.png');
});
