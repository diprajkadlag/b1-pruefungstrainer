import { describe, expect, it } from 'vitest';
import { STUFEN, STUFEN_REIHE, kursstufe, stufeVonId } from './stufen.js';
import type { Modul } from './scoring.js';
import type { Stufe } from './types.js';

/**
 * The level table is duplicated by design: the app needs it before a paper has
 * loaded, and tools/validate.py needs it to gate content. Both trace back to
 * docs/EXAM-FORMAT.md, so the numbers here are asserted against that document
 * rather than against the other copy — a shared bug would otherwise agree with
 * itself.
 */

const MODULE: Modul[] = ['lesen', 'hoeren', 'schreiben', 'sprechen'];

describe('stufeVonId', () => {
  it('reads the level off the folder name', () => {
    expect(stufeVonId('b2-pruefung-01')).toBe('B2');
    expect(stufeVonId('b2-pruefung-14')).toBe('B2');
  });

  it('treats an unprefixed id as B1', () => {
    // The five original papers shipped before a second level existed and were
    // deliberately not renamed, so stored attempts still resolve.
    expect(stufeVonId('pruefung-01')).toBe('B1');
    expect(stufeVonId('pruefung-05')).toBe('B1');
  });
});

describe('STUFEN', () => {
  it('offers exactly the levels in STUFEN_REIHE', () => {
    expect(STUFEN_REIHE).toEqual(Object.keys(STUFEN) as Stufe[]);
  });

  it.each(STUFEN_REIHE)('%s describes all four modules', (stufe) => {
    const format = STUFEN[stufe];
    expect(Object.keys(format.module).sort()).toEqual([...MODULE].sort());
    expect(format.stufe).toBe(stufe);
    expect(format.kurz.length).toBeGreaterThan(10);
    expect(format.gliederungTitel.length).toBeGreaterThan(3);
  });

  it.each(STUFEN_REIHE)('%s labels every module with a duration', (stufe) => {
    for (const modul of MODULE) {
      expect(STUFEN[stufe].module[modul].anzeige).toMatch(/Min\./);
    }
  });

  it.each(STUFEN_REIHE)('%s gives Sprechen no countdown', (stufe) => {
    // Speaking is paced by the recorder, part by part, so a single deadline
    // would cut a candidate off mid-answer.
    expect(STUFEN[stufe].module.sprechen.minuten).toBeNull();
  });

  it('agrees with the receptive modules being identical across levels', () => {
    expect(STUFEN.B1.module.lesen.minuten).toBe(65);
    expect(STUFEN.B2.module.lesen.minuten).toBe(65);
    expect(STUFEN.B1.module.hoeren.minuten).toBe(40);
    expect(STUFEN.B2.module.hoeren.minuten).toBe(40);
  });

  it('keeps the one module length that really does differ', () => {
    // 60 minutes for three tasks at B1, 75 for two much longer ones at B2.
    // This is what the exam countdown reads, so getting it wrong hands the
    // candidate a quarter of an hour they would not have.
    expect(STUFEN.B1.module.schreiben.minuten).toBe(60);
    expect(STUFEN.B2.module.schreiben.minuten).toBe(75);
  });
});

describe('kursstufe', () => {
  it('maps the gentler band to the first stage of a course', () => {
    expect(kursstufe('B2', 'mittel-leicht')).toBe('B2.1');
    expect(kursstufe('B1', 'mittel-leicht')).toBe('B1.1');
  });

  it('maps full exam pressure to the second', () => {
    expect(kursstufe('B2', 'mittel')).toBe('B2.2');
    expect(kursstufe('B1', 'mittel')).toBe('B1.2');
  });

  it.each(STUFEN_REIHE)('%s names a stage for both bands', (stufe) => {
    // A course stage is a study label. The certificate itself has no such
    // split, so nothing downstream may treat B2.1 as a separate exam.
    const stufen = ['mittel-leicht', 'mittel'].map((n) =>
      kursstufe(stufe, n as 'mittel' | 'mittel-leicht'),
    );
    expect(new Set(stufen).size).toBe(2);
    expect(stufen).toEqual([`${stufe}.1`, `${stufe}.2`]);
  });
});
