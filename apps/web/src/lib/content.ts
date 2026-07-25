/**
 * Loading exam content.
 *
 * The public half is fetched when an attempt starts. The keyed half — answers,
 * evidence, rationales, glossary — is fetched only once the attempt is closed,
 * so it is never sitting in memory where a candidate could read it mid-exam.
 * tools/export_web.py produces the split and fails the build if a key leaks.
 */

import type {
  AudioManifest,
  OeffentlichePruefung,
  Schluesseldaten,
} from '@b1/core';

export interface RegistryEintrag {
  id: string;
  titel: string;
  variante: string;
  niveau: string;
  contentVersion: string;
  themen: string[];
  hatAudio: boolean;
  audioFormat: string;
  audioDauerSek: number;
}

const BASIS = `${import.meta.env.BASE_URL}content`;

async function holen<T>(pfad: string): Promise<T> {
  const res = await fetch(pfad, { cache: 'default' });
  if (!res.ok) {
    throw new Error(`${pfad} konnte nicht geladen werden (HTTP ${res.status}).`);
  }
  return (await res.json()) as T;
}

export const registryLaden = (): Promise<{ pruefungen: RegistryEintrag[] }> =>
  holen(`${BASIS}/index.json`);

export const pruefungLaden = (id: string): Promise<OeffentlichePruefung> =>
  holen(`${BASIS}/${id}/exam.public.json`);

export const schluesselLaden = (id: string): Promise<Schluesseldaten> =>
  holen(`${BASIS}/${id}/exam.keys.json`);

export const audioManifestLaden = (id: string): Promise<AudioManifest> =>
  holen(`${BASIS}/${id}/audio/manifest.json`);

export const audioUrl = (id: string, datei: string): string =>
  `${BASIS}/${id}/audio/${datei}`;

/**
 * Pull an exam's audio into the service worker cache so the module can be sat
 * offline. Listening is the one part that fails badly on a flaky connection.
 */
export async function audioVorladen(
  id: string,
  manifest: AudioManifest,
  fortschritt?: (fertig: number, gesamt: number) => void,
): Promise<void> {
  const dateien = [
    ...manifest.hoeren.map((t) => t.datei),
    ...manifest.sprechen.map((s) => s.datei),
  ];
  let fertig = 0;
  for (const datei of dateien) {
    try {
      await fetch(audioUrl(id, datei), { cache: 'force-cache' });
    } catch {
      // One missing file should not abort the rest; the player reports it.
    }
    fortschritt?.(++fertig, dateien.length);
  }
}
