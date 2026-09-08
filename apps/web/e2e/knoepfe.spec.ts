import { expect, test } from '@playwright/test';
import { farben, kontrast, oeffnen } from './hilfe';

/**
 * The main button on every screen wears the level's colour. Two ways that
 * went wrong: in dark mode the colour is lifted to a pastel and white text
 * on it was about 2:1; and in either mode the generic `.knopf:hover` painted
 * its pale grey under the white label, so the button you were about to
 * press went blank the moment the pointer reached it.
 */
for (const schema of ['light', 'dark'] as const) {
  test(`the main button can be read in ${schema} mode, at rest and under the pointer`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: schema });
    await oeffnen(page, 'B1');
    const knopf = page.locator('.knopf--primaer').first();
    await expect(knopf).toBeVisible();

    const ruhe = await farben(knopf);
    expect(kontrast(ruhe.farbe, ruhe.grund)).toBeGreaterThanOrEqual(3);

    await knopf.hover();
    const zeiger = await farben(knopf);
    expect(kontrast(zeiger.farbe, zeiger.grund)).toBeGreaterThanOrEqual(3);
    // Hovering must not take the level's colour away.
    expect(zeiger.grund).toBe(ruhe.grund);
  });
}
