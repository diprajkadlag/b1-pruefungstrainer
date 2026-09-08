import type { Locator, Page } from '@playwright/test';

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

/**
 * WCAG contrast between two computed colours, as Chromium serialises them
 * (`rgb(r, g, b)` or `rgba(r, g, b, a)`). A translucent ground is laid over
 * `unter` first, because that is what the eye sees. Anything else throws:
 * a colour that silently parsed as black would pass every check.
 */
export function kontrast(vorne: string, hinten: string, unter = [255, 255, 255]): number {
  const lesen = (s: string): [number, number, number, number] => {
    const m = /^rgba?\(([^)]+)\)$/.exec(s.trim());
    if (!m) throw new Error(`Farbe nicht lesbar: ${s}`);
    const t = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [t[0]!, t[1]!, t[2]!, t[3] ?? 1];
  };
  const kanal = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const leuchte = ([r, g, b]: readonly number[]) =>
    0.2126 * kanal(r!) + 0.7152 * kanal(g!) + 0.0722 * kanal(b!);
  const [hr, hg, hb, ha] = lesen(hinten);
  const grund = [hr, hg, hb].map((c, i) => ha * c + (1 - ha) * unter[i]!);
  const [l1, l2] = [leuchte(lesen(vorne)), leuchte(grund)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Text and ground of an element as the browser computed them. */
export async function farben(el: Locator): Promise<{ farbe: string; grund: string }> {
  return el.evaluate((e) => {
    const s = getComputedStyle(e);
    return { farbe: s.color, grund: s.backgroundColor };
  });
}
