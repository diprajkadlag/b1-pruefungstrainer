import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { alleFragen, leererFortschritt, rundeBauen } from '@pruefung/core';

/**
 * Not a test — this drives the app through its main screens and saves the
 * images the README uses, so the screenshots can never drift from the UI.
 *
 *   npx playwright test screenshots --update-snapshots
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

test('Screenshots erzeugen', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('z. B. Ravi').fill('Ravi');
  // The registry arrives over the network, and the paper list is the whole
  // point of this shot. Without the wait it is a race that gets slower to win
  // with every paper added — and loses silently, into a committed image.
  await page.getByRole('button', { name: /Übungsprüfung 1/ }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}01-start.png`, fullPage: false });

  await page.getByRole('button', { name: /Übungsprüfung 1/ }).click();
  for (const label of ['Hören', 'Schreiben', 'Sprechen']) {
    const box = page.getByRole('checkbox', { name: new RegExp(label) });
    if (await box.isChecked()) await box.click();
  }
  await page.getByRole('button', { name: /Prüfung starten/ }).click();
  await page.locator('.lesetext').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}02-lesen.png`, fullPage: false });

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
  await page.getByRole('button', { name: /Prüfung abgeben/ }).click();
  await page.locator('.karte').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}03-ergebnis.png`, fullPage: false });

  await page.getByRole('tab', { name: 'Lösungen' }).click();
  await page.locator('.loesung').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}04-loesungen.png`, fullPage: false });

  await page.getByRole('tab', { name: 'Wortschatz' }).click();
  await page.locator('.glossartabelle').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}05-glossar.png`, fullPage: false });

  await page.getByRole('tab', { name: 'Grammatik' }).click();
  await page.locator('.grammatikpunkt').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}06-grammatik.png`, fullPage: false });
});

test('Spickzettel-Screenshots erzeugen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Spickzettel öffnen' }).click();

  await page.getByRole('tab', { name: 'Redemittel' }).click();
  await page.locator('.spick__karte').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}07-spickzettel.png`, fullPage: false });

  await page.getByRole('tab', { name: 'Wortschatz' }).click();
  await page.locator('.spick__tabelle').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}08-wortschatz.png`, fullPage: false });
});

test('Spiel-Screenshots erzeugen', async ({ page }) => {
  // Pinned seed, so the card in the README is the same card every time and a
  // rebuild does not produce a diff for no reason.
  await page.goto('/?saat=20260820');
  await page.getByRole('button', { name: /Spiel starten/ }).click();
  await page.locator('.kachel').first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}09-spiel.png`, fullPage: false });

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
  for (const frage of runde) {
    if (frage.art === 'artikel') break;
    await page
      .locator('.option')
      .filter({ hasText: new RegExp(`^${frage.loesung}$`) })
      .first()
      .click();
    await page.waitForTimeout(1100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}10-spiel-artikel.png`, fullPage: false });
});
