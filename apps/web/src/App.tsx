import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AudioManifest,
  OeffentlichePruefung,
  Schluesseldaten,
} from '@b1/core';
import {
  audioManifestLaden,
  pruefungLaden,
  schluesselLaden,
} from './lib/content';
import {
  laden,
  neuerVersuch,
  speichern,
  type GespeicherterVersuch,
} from './lib/db';
import { abgabeSenden } from './lib/server';
import { Timer, useCountdown } from './components/Timer';
import { Start, type ModulWahl } from './screens/Start';
import { Lesen } from './screens/Lesen';
import { Hoeren } from './screens/Hoeren';
import { Schreiben } from './screens/Schreiben';
import { Sprechen } from './screens/Sprechen';
import { Ergebnis } from './screens/Ergebnis';

type Phase = 'start' | 'laden' | 'pruefung' | 'ergebnis';

/** Sprechen has no single countdown; its parts are timed by the recorder. */
const DAUER: Record<ModulWahl, number | null> = {
  lesen: 65,
  hoeren: 40,
  schreiben: 60,
  sprechen: null,
};

const TITEL: Record<ModulWahl, string> = {
  lesen: 'Lesen',
  hoeren: 'Hören',
  schreiben: 'Schreiben',
  sprechen: 'Sprechen',
};

export default function App() {
  const [phase, setPhase] = useState<Phase>('start');
  const [pruefung, setPruefung] = useState<OeffentlichePruefung | null>(null);
  const [manifest, setManifest] = useState<AudioManifest | null>(null);
  const [schluessel, setSchluessel] = useState<Schluesseldaten | null>(null);
  const [versuch, setVersuch] = useState<GespeicherterVersuch | null>(null);
  const [modulIndex, setModulIndex] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [abgelaufen, setAbgelaufen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [serverHinweis, setServerHinweis] = useState<string | null>(null);

  const aktuellesModul = versuch?.module[modulIndex] as ModulWahl | undefined;

  // Autosave. A debounce keeps IndexedDB writes off the keystroke path while
  // still guaranteeing that a crash costs at most a second of typing.
  const timer = useRef<number>();
  const merken = useCallback((v: GespeicherterVersuch) => {
    setVersuch(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void speichern(v), 800);
  }, []);

  const abgeben = useCallback(async () => {
    if (!versuch || !pruefung) return;
    window.clearTimeout(timer.current);
    const fertig = { ...versuch, abgegeben: new Date().toISOString() };
    await speichern(fertig);
    setVersuch(fertig);

    // If a local server is hosting the app, hand the submission over so the
    // examiner finds it on disk. On GitHub Pages this simply does nothing.
    const gesendet = await abgabeSenden(fertig);
    if (gesendet) {
      setServerHinweis(
        gesendet.ok
          ? 'Die Abgabe wurde an den Prüfer-Server übermittelt.'
          : (gesendet.fehler ?? 'Die Abgabe konnte nicht übermittelt werden.'),
      );
    }

    try {
      // Only now is the key material fetched — never while the exam is open.
      setSchluessel(await schluesselLaden(pruefung.meta.id));
      setPhase('ergebnis');
    } catch {
      setFehler('Die Lösungen konnten nicht geladen werden.');
    }
  }, [versuch, pruefung]);

  const modulBeenden = useCallback(() => {
    if (!versuch) return;
    if (modulIndex + 1 < versuch.module.length) {
      setModulIndex((i) => i + 1);
      setAbgelaufen(false);
    } else {
      void abgeben();
    }
  }, [versuch, modulIndex, abgeben]);

  // Hard auto-submit: when the clock hits zero the module closes itself.
  const restMs = useCountdown(deadline, () => {
    setAbgelaufen(true);
    window.setTimeout(() => modulBeenden(), 2500);
  });

  useEffect(() => {
    if (!aktuellesModul) return;
    const minuten = DAUER[aktuellesModul];
    setDeadline(minuten ? Date.now() + minuten * 60_000 : null);
    setAbgelaufen(false);
    window.scrollTo({ top: 0 });
  }, [aktuellesModul]);

  // Warn before an accidental tab close mid-exam.
  useEffect(() => {
    if (phase !== 'pruefung') return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  async function inhalteLaden(examId: string) {
    setPhase('laden');
    setFehler(null);
    const p = await pruefungLaden(examId);
    setPruefung(p);
    try {
      setManifest(await audioManifestLaden(examId));
    } catch {
      setManifest(null); // Written modules still work without audio.
    }
    return p;
  }

  async function starten(examId: string, name: string, module: ModulWahl[]) {
    try {
      await inhalteLaden(examId);
      const v = neuerVersuch(examId, name, module);
      await speichern(v);
      setVersuch(v);
      setModulIndex(0);
      setPhase('pruefung');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Prüfung konnte nicht geladen werden.');
      setPhase('start');
    }
  }

  async function fortsetzen(id: string) {
    const v = await laden(id);
    if (!v) return;
    try {
      await inhalteLaden(v.examId);
      setVersuch(v);
      setModulIndex(0);
      setPhase('pruefung');
    } catch {
      setFehler('Die Prüfung konnte nicht geladen werden.');
      setPhase('start');
    }
  }

  async function ergebnisAnsehen(id: string) {
    const v = await laden(id);
    if (!v) return;
    try {
      await inhalteLaden(v.examId);
      setSchluessel(await schluesselLaden(v.examId));
      setVersuch(v);
      setPhase('ergebnis');
    } catch {
      setFehler('Die Lösungen konnten nicht geladen werden.');
      setPhase('start');
    }
  }

  function zurueck() {
    setPhase('start');
    setVersuch(null);
    setSchluessel(null);
    setModulIndex(0);
  }

  return (
    <div className="app">
      <header className="kopf">
        <a className="kopf__marke" href={import.meta.env.BASE_URL}>
          B1-Prüfungstrainer
        </a>
        {phase === 'pruefung' && aktuellesModul && versuch && (
          <div className="kopf__lauf">
            <span className="kopf__modul">
              Modul {TITEL[aktuellesModul]} ({modulIndex + 1}/{versuch.module.length})
            </span>
            {deadline !== null && <Timer restMs={restMs} label="Verbleibend" />}
          </div>
        )}
      </header>

      <main className="inhalt">
        {fehler && <p className="fehler">{fehler}</p>}

        {phase === 'laden' && <p className="laden">Prüfung wird geladen …</p>}

        {phase === 'start' && (
          <Start onStart={starten} onWeiter={fortsetzen} onErgebnis={ergebnisAnsehen} />
        )}

        {phase === 'pruefung' && pruefung && versuch && aktuellesModul && (
          <>
            {abgelaufen && (
              <p className="ablauf" role="alert">
                Die Zeit ist abgelaufen. Das Modul wird automatisch abgegeben …
              </p>
            )}

            {aktuellesModul === 'lesen' && (
              <Lesen
                pruefung={pruefung}
                antworten={versuch.antworten.lesen}
                abgelaufen={abgelaufen}
                onAntwort={(nr, wert) =>
                  merken({
                    ...versuch,
                    antworten: {
                      ...versuch.antworten,
                      lesen: { ...versuch.antworten.lesen, [nr]: wert },
                    },
                  })
                }
              />
            )}

            {aktuellesModul === 'hoeren' && (
              <Hoeren
                pruefung={pruefung}
                manifest={manifest}
                antworten={versuch.antworten.hoeren}
                gehoerteTeile={versuch.gehoerteTeile}
                abgelaufen={abgelaufen}
                onGehoert={(teil) =>
                  merken({
                    ...versuch,
                    gehoerteTeile: [...new Set([...versuch.gehoerteTeile, teil])],
                  })
                }
                onAntwort={(nr, wert) =>
                  merken({
                    ...versuch,
                    antworten: {
                      ...versuch.antworten,
                      hoeren: { ...versuch.antworten.hoeren, [nr]: wert },
                    },
                  })
                }
              />
            )}

            {aktuellesModul === 'schreiben' && (
              <Schreiben
                pruefung={pruefung}
                texte={versuch.schreiben}
                abgelaufen={abgelaufen}
                onText={(nummer, text) =>
                  merken({
                    ...versuch,
                    schreiben: { ...versuch.schreiben, [nummer]: text },
                  })
                }
              />
            )}

            {aktuellesModul === 'sprechen' && (
              <Sprechen
                pruefung={pruefung}
                manifest={manifest}
                aufnahmen={versuch.sprechen}
                onAufnahme={(teil, blob) =>
                  merken({
                    ...versuch,
                    sprechen: { ...versuch.sprechen, [teil]: blob },
                  })
                }
              />
            )}

            <div className="abschluss">
              <button
                type="button"
                className="knopf knopf--gross knopf--primaer"
                onClick={modulBeenden}
              >
                {modulIndex + 1 < versuch.module.length
                  ? `Modul abgeben und weiter zu ${TITEL[versuch.module[modulIndex + 1] as ModulWahl]}`
                  : 'Prüfung abgeben und auswerten'}
              </button>
              <p className="notiz">
                Nach der Abgabe können Sie in diesem Modul nichts mehr ändern.
              </p>
            </div>
          </>
        )}

        {phase === 'ergebnis' && serverHinweis && (
          <p className="notiz" role="status">
            {serverHinweis}
          </p>
        )}

        {phase === 'ergebnis' && pruefung && schluessel && versuch && (
          <Ergebnis
            pruefung={pruefung}
            schluessel={schluessel}
            versuch={versuch}
            onNeustart={zurueck}
          />
        )}
      </main>

      <footer className="fuss">
        <span>
          Übungsmaterial CC BY 4.0 · Code MIT · keine offizielle Prüfung, keine Verbindung
          zum Goethe-Institut e.&nbsp;V.
        </span>
        <a href="https://github.com/diprajkadlag/b1-pruefungstrainer">Quellcode</a>
      </footer>
    </div>
  );
}
