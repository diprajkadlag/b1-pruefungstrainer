import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

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
