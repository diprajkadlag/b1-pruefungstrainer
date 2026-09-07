import type { Page } from '@playwright/test';

/**
 * Getting past the front door.
 *
 * The app now asks two questions before it shows anything — which level, and
 * screen or paper — and remembers both. A test that wants the B1 online shelf
 * is not testing those two questions, so it seeds the answers the same way a
 * returning learner arrives with them already given, and lands where the old
 * suite used to land after clicking a level tab.
 *
 * Seeding runs as an init script rather than after navigation, because the
 * start screen reads localStorage while it first renders.
 */
export async function oeffnen(
  page: Page,
  stufe: 'A1' | 'A2' | 'B1' | 'B2',
  modus: 'online' | 'offline' = 'online',
  pfad = '/',
): Promise<void> {
  await page.addInitScript(
    ([s, m]) => {
      localStorage.setItem('pruefung-stufe', s);
      localStorage.setItem('pruefung-modus', m);
    },
    [stufe, modus] as const,
  );
  await page.goto(pfad);
}

/**
 * The front door itself, for the tests that are about the front door: arrive
 * with nothing remembered, so both questions are actually asked.
 */
export async function ersterBesuch(page: Page, pfad = '/'): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('pruefung-stufe');
    localStorage.removeItem('pruefung-modus');
  });
  await page.goto(pfad);
}

/** Choose the level and then the mode, by clicking, as a newcomer would. */
export async function durchDenEingang(
  page: Page,
  stufe: 'A1' | 'A2' | 'B1' | 'B2',
  modus: 'online' | 'offline' = 'online',
): Promise<void> {
  await ersterBesuch(page);
  await page.getByRole('button', { name: new RegExp(`^${stufe}`) }).click();
  await page
    .getByRole('button', { name: modus === 'online' ? /Am Bildschirm/ : /Auf Papier/ })
    .click();
}
