/**
 * Optional hand-off to a local server.
 *
 * The app is fully functional without one — that is the default, and nothing
 * leaves the device. But when it is being served by apps/server, submissions
 * are pushed there too, so a teacher finds the writing and the recordings on
 * disk instead of waiting for the candidate to email a ZIP.
 *
 * Detection is a probe, not a build flag, so the same bundle works on GitHub
 * Pages and behind the server without being rebuilt.
 */

import type { GespeicherterVersuch } from './db';

let verfuegbar: Promise<boolean> | null = null;

export function serverVerfuegbar(): Promise<boolean> {
  verfuegbar ??= fetch(`${import.meta.env.BASE_URL}api/abgaben`, { method: 'GET' })
    .then((r) => r.ok)
    .catch(() => false);
  return verfuegbar;
}

export interface AbgabeErgebnis {
  ok: boolean;
  ordner?: string;
  fehler?: string;
}

export async function abgabeSenden(
  versuch: GespeicherterVersuch,
): Promise<AbgabeErgebnis | null> {
  if (!(await serverVerfuegbar())) return null;

  const form = new FormData();
  form.append(
    'daten',
    JSON.stringify({
      id: versuch.id,
      name: versuch.name,
      examId: versuch.examId,
      gestartet: versuch.gestartet,
      abgegeben: versuch.abgegeben ?? new Date().toISOString(),
      module: versuch.module,
      antworten: versuch.antworten,
      schreiben: versuch.schreiben,
      dateien: [],
    }),
  );

  for (const [teil, blob] of Object.entries(versuch.sprechen)) {
    form.append('aufnahmen', blob, `sprechen_teil${teil}.webm`);
  }

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/abgabe`, {
      method: 'POST',
      body: form,
    });
    return (await res.json()) as AbgabeErgebnis;
  } catch {
    // A failed upload is not fatal: everything is still on the device and the
    // ZIP download remains available.
    return {
      ok: false,
      fehler: 'Die Abgabe konnte nicht an den Server gesendet werden.',
    };
  }
}
