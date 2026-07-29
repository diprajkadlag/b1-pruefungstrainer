/**
 * Optional local server: keeps submissions on disk and gives the examiner a
 * place to mark writing and speaking.
 *
 *   npm run serve            # http://localhost:8130
 *   npm run serve -- --https # self-signed TLS, so a phone on the LAN can record
 *
 * Deliberately unauthenticated and bound to localhost by default. It is meant
 * for one household or one classroom on a trusted machine.
 *
 *   !! Do not expose this to the internet. It would publish voice recordings
 *      and written work to anyone who found it. See docs/PRIVACY.md.
 */

import express from 'express';
import multer from 'multer';
import { createServer as createHttpsServer } from 'node:https';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bewerteModul, gesamtergebnis, type Modul, type Schluessel } from '@b1/core';
import { selbstsigniertesZertifikat } from './tls.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '../../..');
const INHALTE = join(WURZEL, 'content', 'exams');
const STATISCH = join(WURZEL, 'apps', 'web', 'dist');
const ABGABEN = process.env.ABGABEN_DIR ?? join(WURZEL, 'apps', 'server', 'submissions');

// 8130, not 3000. This server hosts the PWA, and a service worker claims a
// whole origin (scheme + host + port) — so squatting the most contended port
// in Node development leaves this app answering navigations for whatever the
// user starts on 3000 next. Override with PORT if you need to.
const PORT = Number(process.env.PORT ?? 8130);
const HTTPS = process.argv.includes('--https');
// Binding to 0.0.0.0 is opt-in, because it exposes an unauthenticated server.
const HOST = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

const app = express();
app.use(express.json({ limit: '2mb' }));

/** Reject anything that could climb out of the submissions directory. */
const sichererName = (s: string): string =>
  s
    .replace(/[^\p{L}\p{N} _.-]/gu, '_')
    .replace(/^\.+/, '')
    .slice(0, 80) || 'unbenannt';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 6 },
});

// --- exam content ----------------------------------------------------------

async function schluesselLesen(examId: string): Promise<Record<string, Schluessel>> {
  const pfad = join(INHALTE, sichererName(examId), 'exam.json');
  const exam = JSON.parse(await readFile(pfad, 'utf-8'));
  const keys: Record<string, Schluessel> = {};
  for (const modul of ['lesen', 'hoeren'] as const) {
    for (const teil of exam[modul].teile) {
      for (const item of teil.items) {
        keys[`${modul}-${item.nr}`] = {
          loesung: item.loesung,
          teil: teil.nummer,
          kompetenz: item.kompetenz ?? '',
        };
      }
    }
  }
  return keys;
}

// --- submissions -----------------------------------------------------------

interface Abgabe {
  id: string;
  name: string;
  examId: string;
  gestartet: string;
  abgegeben: string;
  module: string[];
  antworten: { lesen: Record<string, string>; hoeren: Record<string, string> };
  schreiben: Record<string, string>;
  dateien: string[];
  auswertung?: Record<string, number>;
  bewertung?: {
    schreiben?: number;
    sprechen?: number;
    kommentar?: string;
    bewertetAm?: string;
  };
}

const ordnerFuer = (a: Pick<Abgabe, 'name' | 'examId' | 'abgegeben'>): string =>
  join(
    ABGABEN,
    sichererName(a.name || 'kandidat'),
    sichererName(a.examId),
    a.abgegeben.slice(0, 19).replace(/[:]/g, '-'),
  );

app.post('/api/abgabe', upload.array('aufnahmen'), async (req, res) => {
  try {
    const daten = JSON.parse(String(req.body.daten)) as Abgabe;
    const ordner = ordnerFuer(daten);
    await mkdir(ordner, { recursive: true });

    const dateien: string[] = [];
    for (const datei of (req.files as Express.Multer.File[]) ?? []) {
      const name = sichererName(datei.originalname);
      await writeFile(join(ordner, name), datei.buffer);
      dateien.push(name);
    }

    for (const [nr, text] of Object.entries(daten.schreiben ?? {})) {
      if (text?.trim()) {
        await writeFile(
          join(ordner, `schreiben_aufgabe${sichererName(nr)}.txt`),
          text,
          'utf-8',
        );
      }
    }

    // Mark the objective modules server-side too. The app already did it, but
    // the examiner's copy should not depend on the candidate's browser.
    const keys = await schluesselLesen(daten.examId);
    const auswertung: Record<string, number> = {};
    for (const modul of ['lesen', 'hoeren'] as Modul[]) {
      if (!daten.module.includes(modul)) continue;
      auswertung[modul] = bewerteModul(
        modul,
        daten.antworten[modul as 'lesen' | 'hoeren'] ?? {},
        keys,
      ).punkte;
    }

    const vollstaendig: Abgabe = { ...daten, dateien, auswertung };
    await writeFile(
      join(ordner, 'abgabe.json'),
      JSON.stringify(vollstaendig, null, 2),
      'utf-8',
    );

    res.json({ ok: true, ordner: ordner.replace(ABGABEN, '').replaceAll('\\', '/') });
  } catch (err) {
    console.error('Abgabe fehlgeschlagen:', err);
    res
      .status(400)
      .json({ ok: false, fehler: 'Die Abgabe konnte nicht gespeichert werden.' });
  }
});

/** Walk the submissions tree; it is only three levels deep by construction. */
async function alleAbgaben(): Promise<(Abgabe & { pfad: string })[]> {
  if (!existsSync(ABGABEN)) return [];
  const out: (Abgabe & { pfad: string })[] = [];

  for (const name of await readdir(ABGABEN)) {
    for (const exam of await readdir(join(ABGABEN, name)).catch(() => [])) {
      for (const stamp of await readdir(join(ABGABEN, name, exam)).catch(() => [])) {
        const ordner = join(ABGABEN, name, exam, stamp);
        try {
          const daten = JSON.parse(
            await readFile(join(ordner, 'abgabe.json'), 'utf-8'),
          ) as Abgabe;
          out.push({ ...daten, pfad: `${name}/${exam}/${stamp}` });
        } catch {
          // A folder without a readable abgabe.json is simply skipped.
        }
      }
    }
  }
  return out.sort((a, b) => b.abgegeben.localeCompare(a.abgegeben));
}

app.get('/api/abgaben', async (_req, res) => {
  res.json({ abgaben: await alleAbgaben() });
});

app.get('/api/abgabe/:pfad(*)/datei/:name', async (req, res) => {
  const teile = String(req.params['pfad'] ?? '')
    .split('/')
    .map(sichererName);
  const ordner = join(ABGABEN, ...teile);
  const datei = join(ordner, sichererName(String(req.params['name'] ?? '')));
  if (!datei.startsWith(ABGABEN)) {
    res.status(400).end();
    return;
  }
  res.sendFile(datei);
});

app.post('/api/abgabe/:pfad(*)/bewertung', async (req, res) => {
  try {
    const teile = String(req.params['pfad'] ?? '')
      .split('/')
      .map(sichererName);
    const ordner = join(ABGABEN, ...teile);
    const pfad = join(ordner, 'abgabe.json');
    const daten = JSON.parse(await readFile(pfad, 'utf-8')) as Abgabe;

    daten.bewertung = {
      schreiben: Number(req.body.schreiben) || undefined,
      sprechen: Number(req.body.sprechen) || undefined,
      kommentar: String(req.body.kommentar ?? ''),
      bewertetAm: new Date().toISOString(),
    };

    await writeFile(pfad, JSON.stringify(daten, null, 2), 'utf-8');
    res.json({
      ok: true,
      gesamt: gesamtergebnis({
        lesen: daten.auswertung?.lesen,
        hoeren: daten.auswertung?.hoeren,
        schreiben: daten.bewertung.schreiben,
        sprechen: daten.bewertung.sprechen,
      }),
    });
  } catch (err) {
    console.error('Bewertung fehlgeschlagen:', err);
    res.status(400).json({ ok: false });
  }
});

// --- examiner page and static app ------------------------------------------

app.get('/pruefer', (_req, res) => {
  res.sendFile(join(HIER, 'pruefer.html'));
});

if (existsSync(STATISCH)) {
  app.use(express.static(STATISCH));
  app.get('*', (_req, res) => res.sendFile(join(STATISCH, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .status(503)
      .send(
        '<p>Die Web-App ist noch nicht gebaut. Führen Sie <code>npm run build</code> ' +
          'aus und starten Sie den Server neu.</p>',
      ),
  );
}

// --- start -----------------------------------------------------------------

async function start() {
  await mkdir(ABGABEN, { recursive: true });
  const schema = HTTPS ? 'https' : 'http';
  const anzeige = HOST === '0.0.0.0' ? 'localhost' : HOST;

  const fertig = () => {
    console.log(`\n  B1-Prüfungstrainer`);
    console.log(`  App      ${schema}://${anzeige}:${PORT}/`);
    console.log(`  Prüfer   ${schema}://${anzeige}:${PORT}/pruefer`);
    console.log(`  Abgaben  ${ABGABEN}`);
    if (!HTTPS) {
      console.log(
        `\n  Hinweis: Sprachaufnahme funktioniert nur über localhost oder HTTPS.\n` +
          `  Für ein Handy im WLAN: npm run serve -- --https --lan`,
      );
    }
    if (HOST === '0.0.0.0') {
      console.log(
        `\n  !! Der Server ist im Netzwerk erreichbar und hat keine Anmeldung.`,
      );
    }
    console.log();
  };

  if (HTTPS) {
    const { key, cert } = await selbstsigniertesZertifikat();
    createHttpsServer({ key, cert }, app).listen(PORT, HOST, fertig);
  } else {
    app.listen(PORT, HOST, fertig);
  }
}

void start();
