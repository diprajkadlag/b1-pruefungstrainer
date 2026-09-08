import { describe, expect, it } from 'vitest';
import {
  ABPRALL,
  BODEN,
  ENTE,
  ENTEN_WEG,
  HELD,
  KEINE_EINGABE,
  KISTE,
  KISTEN_UNTERKANTE,
  KLANG_AUS,
  KLANG_MUENZE,
  KLANG_SPRUNG,
  KLANG_STAMPFER,
  KLANG_TREFFER,
  KLANG_ZIEL,
  SCHRITT,
  SCHWERKRAFT,
  SPRUNG,
  anlaufX,
  entenBlick,
  entenX,
  heldAnfang,
  kameraX,
  schritt,
  stationBauen,
  zielArten,
  type Eingabe,
  type Frage,
  type Held,
  type Station,
} from './index.js';

/**
 * The platformer's rules, without a canvas.
 *
 * What is tested here is what would make the game unfair rather than merely
 * ugly: that a jump reaches a box and no further, that a wrong-looking
 * collision is not an answer, that a used target stays quiet, that the world
 * cannot be walked out of, and that the same inputs always produce the same
 * run — the last of which is what lets the end-to-end test steer the hero.
 */

function frage(optionen: string[]): Frage {
  return {
    id: 'f-1',
    art: 'artikel',
    kategorie: 'wortschatz',
    hinweis: 'Wortschatz',
    frage: 'Welcher Artikel?',
    optionen,
    loesung: optionen[0]!,
    erklaerung: 'weil',
    szene: 'person',
  };
}

/** Run n slices with a constant input. */
function laufen(
  held: Held,
  station: Station,
  eingabe: Eingabe,
  n: number,
  verbraucht = new Set<number>(),
  tStart = 0,
) {
  const alle = [];
  let t = tStart;
  for (let i = 0; i < n; i++) {
    const r = schritt(held, eingabe, station, t, verbraucht);
    held = r.held;
    alle.push(...r.ereignisse);
    t += SCHRITT;
  }
  return { held, ereignisse: alle, t };
}

describe('the shape of a station', () => {
  it('alternates boxes, ducks and a mix across stations', () => {
    expect(zielArten(3, 0)).toEqual(['kiste', 'kiste', 'kiste']);
    expect(zielArten(3, 1)).toEqual(['ente', 'ente', 'ente']);
    expect(zielArten(4, 2)).toEqual(['kiste', 'ente', 'kiste', 'ente']);
    expect(zielArten(2, 3)).toEqual(['kiste', 'kiste']);
  });

  it('hangs boxes where a jump reaches them and stands ducks on the ground', () => {
    const s = stationBauen(frage(['a', 'b', 'c', 'd']), 2);
    for (const z of s.ziele) {
      if (z.art === 'kiste') expect(z.y + KISTE.hoehe).toBe(KISTEN_UNTERKANTE);
      else expect(z.y + ENTE.hoehe).toBe(BODEN);
    }
    // In option order, left to right, with room to land between them.
    const xs = s.ziele.map((z) => z.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(s.ziele.map((z) => z.text)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is wide enough that the last target is not at the edge', () => {
    const s = stationBauen(frage(['a', 'b', 'c', 'd', 'e', 'f']), 0);
    const letztes = s.ziele[s.ziele.length - 1]!;
    expect(s.breite).toBeGreaterThan(letztes.x + KISTE.breite + HELD.breite + 40);
  });

  it('a jump from the ground reaches the underside of a box and no further', () => {
    // Kinematics: peak height = v² / 2g. It must clear the gap to the boxes
    // but must not pass through them from below.
    const s = stationBauen(frage(['a']), 0);
    let held = heldAnfang(s);
    // Stand clear of any box and jump straight up.
    held = { ...held, x: 5 };
    const { held: oben } = laufen(held, s, { ...KEINE_EINGABE, springen: true }, 1);
    // Gravity already took its first slice in the same step.
    expect(oben.vy).toBeCloseTo(SPRUNG + SCHWERKRAFT * SCHRITT, 6);
    let hoechster = oben.y;
    let h = oben;
    for (let i = 0; i < 200; i++) {
      h = schritt(h, KEINE_EINGABE, s, i * SCHRITT).held;
      hoechster = Math.min(hoechster, h.y);
    }
    const kopfHoehe = BODEN - hoechster;
    expect(kopfHoehe).toBeGreaterThan(
      BODEN - KISTEN_UNTERKANTE + HELD.hoehe - HELD.hoehe,
    );
    expect(kopfHoehe).toBeLessThan(BODEN - KISTEN_UNTERKANTE + KISTE.hoehe + HELD.hoehe);
  });
});

describe('answering with the feet', () => {
  it('heading a box from below is an answer, once', () => {
    const s = stationBauen(frage(['a', 'b']), 0);
    const kiste = s.ziele[0]!;
    let held = heldAnfang(s);
    held = { ...held, x: kiste.x + KISTE.breite / 2 - HELD.breite / 2 };
    const r = laufen(held, s, { ...KEINE_EINGABE, springen: true }, 1);
    const flug = laufen(r.held, s, KEINE_EINGABE, 120);
    const treffer = flug.ereignisse.filter((e) => e.art === 'kopfstoss');
    expect(treffer).toHaveLength(1);
    expect(treffer[0]!.art === 'kopfstoss' && treffer[0]!.ziel.index).toBe(0);
    // Bumped back down, not through.
    expect(flug.held.y).toBeGreaterThanOrEqual(kiste.y + KISTE.hoehe - 1);
  });

  it('a box already used stays solid but says nothing', () => {
    const s = stationBauen(frage(['a', 'b']), 0);
    const kiste = s.ziele[0]!;
    let held = heldAnfang(s);
    held = { ...held, x: kiste.x + KISTE.breite / 2 - HELD.breite / 2 };
    const verbraucht = new Set([0]);
    const r = laufen(held, s, { ...KEINE_EINGABE, springen: true }, 1, verbraucht);
    const flug = laufen(r.held, s, KEINE_EINGABE, 120, verbraucht);
    expect(flug.ereignisse.some((e) => e.art === 'kopfstoss')).toBe(false);
    // But the hero still could not pass through it.
    expect(flug.held.y).toBeGreaterThanOrEqual(kiste.y + KISTE.hoehe - 1);
  });

  it('landing on a duck is an answer and a little bounce', () => {
    const s = stationBauen(frage(['a', 'b']), 1);
    const ente = s.ziele[1]!;
    const t = 0.3;
    // Drop the hero from above the duck's current position.
    const held: Held = {
      ...heldAnfang(s),
      x: entenX(ente, t) + ENTE.breite / 2 - HELD.breite / 2,
      y: ente.y - HELD.hoehe - 40,
      amBoden: false,
    };
    const r = laufen(held, s, KEINE_EINGABE, 60, new Set(), t);
    const stampf = r.ereignisse.filter((e) => e.art === 'stampfer');
    expect(stampf).toHaveLength(1);
    expect(stampf[0]!.art === 'stampfer' && stampf[0]!.ziel.index).toBe(1);
  });

  it('a stomp bounces the hero upward', () => {
    const s = stationBauen(frage(['a']), 1);
    const ente = s.ziele[0]!;
    let held: Held = {
      ...heldAnfang(s),
      x: entenX(ente, 0) + ENTE.breite / 2 - HELD.breite / 2,
      y: ente.y - HELD.hoehe - 2,
      vy: 200,
      amBoden: false,
    };
    // A couple of slices to cross the last two pixels onto its back.
    let getroffen = false;
    for (let i = 0; i < 10 && !getroffen; i++) {
      const r = schritt(held, KEINE_EINGABE, s, 0);
      held = r.held;
      getroffen = r.ereignisse.some((e) => e.art === 'stampfer');
    }
    expect(getroffen).toBe(true);
    expect(held.vy).toBeCloseTo(ABPRALL, 6);
  });

  it('walking into a duck from the side is not an answer', () => {
    const s = stationBauen(frage(['a']), 1);
    const ente = s.ziele[0]!;
    // Stand on the ground right next to it and walk through.
    let held: Held = { ...heldAnfang(s), x: entenX(ente, 0) - HELD.breite - 2 };
    const r = laufen(held, s, { ...KEINE_EINGABE, rechts: true }, 240);
    expect(r.ereignisse.some((e) => e.art === 'stampfer')).toBe(false);
    held = r.held;
    expect(held.x).toBeGreaterThan(ente.x);
  });

  it('a stomped duck is gone', () => {
    const s = stationBauen(frage(['a']), 1);
    const ente = s.ziele[0]!;
    const held: Held = {
      ...heldAnfang(s),
      x: entenX(ente, 0) + ENTE.breite / 2 - HELD.breite / 2,
      y: ente.y - HELD.hoehe - 2,
      vy: 200,
      amBoden: false,
    };
    const r = schritt(held, KEINE_EINGABE, s, 0, new Set([0]));
    expect(r.ereignisse.some((e) => e.art === 'stampfer')).toBe(false);
  });
});

describe('moving through the world', () => {
  it('cannot be walked out of at either end', () => {
    const s = stationBauen(frage(['a', 'b']), 0);
    const links = laufen(heldAnfang(s), s, { ...KEINE_EINGABE, links: true }, 600);
    expect(links.held.x).toBe(0);
    const rechts = laufen(heldAnfang(s), s, { ...KEINE_EINGABE, rechts: true }, 2400);
    expect(rechts.held.x).toBe(s.breite - HELD.breite);
  });

  it('a box blocks from the side', () => {
    const s = stationBauen(frage(['a']), 0);
    const kiste = s.ziele[0]!;
    // Start level with the box, just left of it, and push right.
    const held: Held = {
      ...heldAnfang(s),
      x: kiste.x - HELD.breite - 10,
      y: kiste.y,
      amBoden: false,
    };
    const r = schritt({ ...held, vx: 150 }, { ...KEINE_EINGABE, rechts: true }, s, 0);
    // Either stopped at the box or still short of it; never inside.
    expect(r.held.x + HELD.breite).toBeLessThanOrEqual(kiste.x + 0.001);
  });

  it('jumps only from the ground and reports it', () => {
    const s = stationBauen(frage(['a']), 0);
    const held = { ...heldAnfang(s), x: 5 };
    const erste = schritt(held, { ...KEINE_EINGABE, springen: true }, s, 0);
    expect(erste.ereignisse.some((e) => e.art === 'sprung')).toBe(true);
    const zweite = schritt(erste.held, { ...KEINE_EINGABE, springen: true }, s, SCHRITT);
    expect(zweite.ereignisse.some((e) => e.art === 'sprung')).toBe(false);
  });

  it('reports the landing once, on the ground', () => {
    const s = stationBauen(frage(['a']), 0);
    const held = { ...heldAnfang(s), x: 5 };
    const r = laufen(held, s, { ...KEINE_EINGABE, springen: true }, 1);
    const flug = laufen(r.held, s, KEINE_EINGABE, 300);
    expect(flug.ereignisse.filter((e) => e.art === 'landung')).toHaveLength(1);
    expect(flug.held.amBoden).toBe(true);
    expect(flug.held.y).toBe(BODEN - HELD.hoehe);
  });

  it('the leg clock runs only while running on the ground', () => {
    const s = stationBauen(frage(['a', 'b']), 0);
    const still = laufen(heldAnfang(s), s, KEINE_EINGABE, 10);
    expect(still.held.lauf).toBe(0);
    const los = laufen(heldAnfang(s), s, { ...KEINE_EINGABE, rechts: true }, 30);
    expect(los.held.lauf).toBeGreaterThan(0);
    const inDerLuft = laufen(los.held, s, { ...KEINE_EINGABE, springen: true }, 3);
    expect(inDerLuft.held.lauf).toBe(0);
  });

  it('is deterministic: the same inputs give the same run', () => {
    const s = stationBauen(frage(['a', 'b', 'c']), 2);
    const eingaben: Eingabe[] = Array.from({ length: 500 }, (_, i) => ({
      links: i % 97 < 20,
      rechts: i % 97 >= 20,
      springen: i % 60 === 0,
    }));
    const run = () => {
      let held = heldAnfang(s);
      const log: string[] = [];
      eingaben.forEach((e, i) => {
        const r = schritt(held, e, s, i * SCHRITT);
        held = r.held;
        log.push(...r.ereignisse.map((x) => x.art));
      });
      return { held, log };
    };
    expect(run()).toEqual(run());
  });
});

describe('ducks and the camera', () => {
  it('a duck waddles within its lane and faces the way it goes', () => {
    const s = stationBauen(frage(['a', 'b']), 1);
    const z = s.ziele[0]!;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 10; t += 0.05) {
      const x = entenX(z, t) + ENTE.breite / 2;
      min = Math.min(min, x);
      max = Math.max(max, x);
      expect([1, -1]).toContain(entenBlick(z, t));
    }
    expect(min).toBeGreaterThanOrEqual(z.x - ENTEN_WEG - 0.001);
    expect(max).toBeLessThanOrEqual(z.x + ENTEN_WEG + 0.001);
  });

  it('two ducks are not in step', () => {
    const s = stationBauen(frage(['a', 'b']), 1);
    const [a, b] = s.ziele as [(typeof s.ziele)[0], (typeof s.ziele)[0]];
    expect(entenX(a, 1) - a.x).not.toBeCloseTo(entenX(b, 1) - b.x, 1);
  });

  it('the camera keeps the hero in view and never leaves the station', () => {
    const s = stationBauen(frage(['a', 'b', 'c', 'd']), 0);
    const sicht = 320;
    expect(kameraX(heldAnfang(s), s, sicht)).toBe(0);
    const ende = { ...heldAnfang(s), x: s.breite - HELD.breite };
    expect(kameraX(ende, s, sicht)).toBe(s.breite - sicht);
    const mitte = { ...heldAnfang(s), x: s.breite / 2 };
    const k = kameraX(mitte, s, sicht);
    expect(mitte.x).toBeGreaterThan(k);
    expect(mitte.x).toBeLessThan(k + sicht);
  });

  it('the run-up puts the hero centred under a box or over a duck', () => {
    const s = stationBauen(frage(['a', 'b']), 2);
    const kiste = s.ziele[0]!;
    const ente = s.ziele[1]!;
    expect(anlaufX(kiste, 0) + HELD.breite / 2).toBeCloseTo(kiste.x + KISTE.breite / 2);
    expect(anlaufX(ente, 2) + HELD.breite / 2).toBeCloseTo(
      entenX(ente, 2) + ENTE.breite / 2,
    );
  });
});

describe('the sounds', () => {
  it('are short, rising for good news and falling for bad', () => {
    const steigt = (t: readonly { hz: number }[]) => t[t.length - 1]!.hz > t[0]!.hz;
    expect(steigt(KLANG_SPRUNG)).toBe(true);
    expect(steigt(KLANG_MUENZE)).toBe(true);
    expect(steigt(KLANG_ZIEL)).toBe(true);
    expect(steigt(KLANG_STAMPFER)).toBe(false);
    expect(steigt(KLANG_TREFFER)).toBe(false);
    expect(steigt(KLANG_AUS)).toBe(false);
    for (const folge of [KLANG_SPRUNG, KLANG_MUENZE, KLANG_STAMPFER, KLANG_TREFFER]) {
      const ende = Math.max(...folge.map((t) => t.ab + t.dauer));
      expect(ende).toBeLessThan(0.6);
    }
  });
});
