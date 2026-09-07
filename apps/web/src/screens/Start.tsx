import { useEffect, useState } from 'react';
import { STUFEN, STUFEN_REIHE, kursstufe, type Stufe } from '@pruefung/core';
import { registryLaden, type RegistryEintrag, type StufenPdfName } from '../lib/content';
import { alleVersuche, loeschen, type GespeicherterVersuch } from '../lib/db';
import { Offline } from './Offline';

export type ModulWahl = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen';
export type Modus = 'online' | 'offline';

/** Official order, which is also the order a candidate sits them in. */
const MODULE: { id: ModulWahl; label: string }[] = [
  { id: 'lesen', label: 'Lesen' },
  { id: 'hoeren', label: 'Hören' },
  { id: 'schreiben', label: 'Schreiben' },
  { id: 'sprechen', label: 'Sprechen' },
];

const STUFE_GESPEICHERT = 'pruefung-stufe';
const MODUS_GESPEICHERT = 'pruefung-modus';

interface Props {
  onStart: (examId: string, module: ModulWahl[]) => void;
  onWeiter: (versuchId: string) => void;
  onErgebnis: (versuchId: string) => void;
  onSpickzettel: (stufe: Stufe) => void;
  onSpiel: (stufe: Stufe) => void;
  onSprechtraining: (stufe: Stufe) => void;
}

/**
 * The way in.
 *
 * Two questions before anything else: which level, and on screen or on paper.
 * Everything after that belongs to one of those answers, so the page only ever
 * shows what the person can actually use. Both answers are remembered, so a
 * returning learner lands straight on their own shelf and the two chips at the
 * top are the only thing standing between them and a different one.
 *
 * The previous version put all of it on a single page — four levels, three
 * study tools, five papers, the module picker and the printables — which ran
 * past three thousand pixels on a phone and buried the level tabs at the top
 * where nobody scrolled back to find them.
 */
export function Start({
  onStart,
  onWeiter,
  onErgebnis,
  onSpickzettel,
  onSpiel,
  onSprechtraining,
}: Props) {
  const [pruefungen, setPruefungen] = useState<RegistryEintrag[]>([]);
  const [lernhilfeStufen, setLernhilfeStufen] = useState<Stufe[]>([]);
  const [sprechenStufen, setSprechenStufen] = useState<Stufe[]>([]);
  const [stufenPdfs, setStufenPdfs] = useState<Partial<Record<Stufe, StufenPdfName[]>>>(
    {},
  );
  const [versuche, setVersuche] = useState<GespeicherterVersuch[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);

  const [stufe, setStufe] = useState<Stufe | null>(
    () => (localStorage.getItem(STUFE_GESPEICHERT) as Stufe | null) ?? null,
  );
  const [modus, setModus] = useState<Modus | null>(
    () => (localStorage.getItem(MODUS_GESPEICHERT) as Modus | null) ?? null,
  );
  const [examId, setExamId] = useState('');
  const [module, setModule] = useState<ModulWahl[]>(['lesen', 'hoeren']);

  useEffect(() => {
    registryLaden()
      .then((r) => {
        setPruefungen(r.pruefungen);
        setLernhilfeStufen(r.lernhilfeStufen ?? []);
        setSprechenStufen(r.sprechenStufen ?? []);
        setStufenPdfs(r.stufenPdfs ?? {});
      })
      .catch(() =>
        setFehler(
          'Die Prüfungen konnten nicht geladen werden. Wurde ' +
            '„python tools/export_web.py“ ausgeführt?',
        ),
      )
      .finally(() => setGeladen(true));
    void alleVersuche().then(setVersuche);
  }, []);

  // The level's colour is published on <html>, so the header, the buttons and
  // every card downstream pick it up without being handed the level.
  useEffect(() => {
    if (stufe) document.documentElement.dataset.stufe = stufe;
    else delete document.documentElement.dataset.stufe;
  }, [stufe]);

  // Only papers of the chosen level, and never a selection left over from the
  // other one — switching level must not silently start a B1 paper from a B2 tab.
  const sichtbar = pruefungen.filter((p) => p.stufe === stufe);
  useEffect(() => {
    setExamId((cur) =>
      sichtbar.some((p) => p.id === cur) ? cur : (sichtbar[0]?.id ?? ''),
    );
  }, [stufe, pruefungen.length]);

  const angeboteneStufen = STUFEN_REIHE.filter((s) =>
    pruefungen.some((p) => p.stufe === s),
  );

  function stufeWaehlen(neu: Stufe) {
    setStufe(neu);
    localStorage.setItem(STUFE_GESPEICHERT, neu);
  }

  function modusWaehlen(neu: Modus) {
    setModus(neu);
    localStorage.setItem(MODUS_GESPEICHERT, neu);
  }

  function umschalten(id: ModulWahl) {
    setModule((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  const disclaimer = (
    <section className="hinweis-box">
      <strong>Keine offizielle Prüfung.</strong> Dieses Übungsmaterial steht in keiner
      Verbindung zum Goethe-Institut e.&nbsp;V., zur telc gGmbH oder zum ÖSD. Alle Texte
      und Aufgaben sind eigens für dieses Projekt verfasst.
    </section>
  );

  // ---- Step 1: which level ------------------------------------------------
  // Held back until the registry answers, because a level list built from an
  // empty registry would flash one wrong set of choices and then replace it.
  if (!geladen && !fehler) {
    return <p className="laden">Wird geladen …</p>;
  }

  if (stufe === null || !angeboteneStufen.includes(stufe)) {
    return (
      <div className="start">
        {disclaimer}
        {fehler && <p className="fehler">{fehler}</p>}
        <section className="wahl">
          <h2 className="wahl__frage">Welches Niveau?</h2>
          <p className="notiz">Sie können das später jederzeit wechseln.</p>
          <div className="wahl__karten">
            {angeboteneStufen.map((s) => (
              <button
                key={s}
                type="button"
                className="wahlkarte"
                data-stufe={s}
                onClick={() => stufeWaehlen(s)}
              >
                <strong className="wahlkarte__titel">{s}</strong>
                <span className="wahlkarte__text">{STUFEN[s].kurz}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ---- Step 2: on screen or on paper --------------------------------------
  if (modus === null) {
    return (
      <div className="start">
        {disclaimer}
        <Wegweiser
          stufe={stufe}
          modus={null}
          onStufe={() => setStufe(null)}
          onModus={() => setModus(null)}
        />
        <section className="wahl">
          <h2 className="wahl__frage">Wie möchten Sie üben?</h2>
          <div className="wahl__karten wahl__karten--zwei">
            <button
              type="button"
              className="wahlkarte"
              onClick={() => modusWaehlen('online')}
            >
              <strong className="wahlkarte__titel">Am Bildschirm</strong>
              <span className="wahlkarte__text">
                Prüfung ablegen mit Zeit und Punkten, Spickzettel nachschlagen, Wörter
                spielen, Sprechen üben.
              </span>
            </button>
            <button
              type="button"
              className="wahlkarte"
              onClick={() => modusWaehlen('offline')}
            >
              <strong className="wahlkarte__titel">Auf Papier</strong>
              <span className="wahlkarte__text">
                Alle Hefte als PDF — hier lesen oder herunterladen und ausdrucken.
              </span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ---- Step 3: what that answer makes available ---------------------------
  const kopf = (
    <>
      <Wegweiser
        stufe={stufe}
        modus={modus}
        onStufe={() => setStufe(null)}
        onModus={() => setModus(null)}
      />
      {fehler && <p className="fehler">{fehler}</p>}
    </>
  );

  if (modus === 'offline') {
    return (
      <div className="start">
        {kopf}
        <Offline
          stufe={stufe}
          pruefungen={sichtbar}
          stufenPdfs={stufenPdfs[stufe] ?? []}
        />
      </div>
    );
  }

  const offen = versuche.filter((v) => !v.abgegeben);
  const fertig = versuche.filter((v) => v.abgegeben);

  return (
    <div className="start">
      {kopf}

      <section className="werkzeuge">
        {lernhilfeStufen.includes(stufe) && (
          <button type="button" className="werkzeug" onClick={() => onSpickzettel(stufe)}>
            <span className="werkzeug__zeichen" aria-hidden="true">
              📘
            </span>
            <span className="werkzeug__text">
              <strong>Spickzettel</strong>
              <span className="notiz">
                Strategie, Redemittel, Grammatik und Wortschatz zum Nachschlagen.
              </span>
            </span>
          </button>
        )}
        {lernhilfeStufen.includes(stufe) && (
          <button type="button" className="werkzeug" onClick={() => onSpiel(stufe)}>
            <span className="werkzeug__zeichen" aria-hidden="true">
              ✨
            </span>
            <span className="werkzeug__text">
              <strong>Sprachschatz</strong>
              <span className="notiz">
                Dieselben Wörter und Regeln, aber abgefragt statt nachgeschlagen.
              </span>
            </span>
          </button>
        )}
        {sprechenStufen.includes(stufe) && (
          <button
            type="button"
            className="werkzeug"
            onClick={() => onSprechtraining(stufe)}
          >
            <span className="werkzeug__zeichen" aria-hidden="true">
              🎤
            </span>
            <span className="werkzeug__text">
              <strong>Sprechtraining</strong>
              <span className="notiz">
                50 Sprechaufgaben mit deutschem Hintergrundwissen und Musterlösungen.
              </span>
            </span>
          </button>
        )}
      </section>

      {offen.length > 0 && (
        <section className="teil">
          <h2>Angefangen</h2>
          {offen.map((v) => (
            <div className="versuchszeile" key={v.id}>
              <span>
                {v.examId} · {new Date(v.gestartet).toLocaleDateString('de-DE')} ·{' '}
                {v.module.join(', ')}
              </span>
              <span className="versuchszeile__knoepfe">
                <button type="button" className="knopf" onClick={() => onWeiter(v.id)}>
                  Fortsetzen
                </button>
                <button
                  type="button"
                  className="knopf knopf--sekundaer"
                  onClick={() =>
                    void loeschen(v.id).then(() => alleVersuche().then(setVersuche))
                  }
                >
                  Löschen
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {fertig.length > 0 && (
        <section className="teil">
          <h2>Frühere Ergebnisse</h2>
          {fertig.slice(0, 8).map((v) => (
            <div className="versuchszeile" key={v.id}>
              <span>
                {v.examId} · {new Date(v.gestartet).toLocaleDateString('de-DE')} ·{' '}
                {v.module.join(', ')}
              </span>
              <button type="button" className="knopf" onClick={() => onErgebnis(v.id)}>
                Ergebnis ansehen
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="teil">
        <h2>Prüfung ablegen</h2>
        <p className="notiz">
          Mit Uhr und Auswertung. Lesen und Hören werden automatisch bewertet; für
          Schreiben und Sprechen bekommen Sie am Ende Musterlösungen zum Vergleichen.
        </p>

        <div className="pruefungswahl">
          {sichtbar.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`pruefungskarte ${examId === p.id ? 'pruefungskarte--aktiv' : ''}`}
              onClick={() => setExamId(p.id)}
              aria-pressed={examId === p.id}
            >
              <strong>{p.titel}</strong>
              <span className="pruefungskarte__meta">
                {kursstufe(p.stufe, p.niveau)} · {p.variante}
                {p.hatAudio && ` · ${Math.round(p.audioDauerSek / 60)} Min. Audio`}
              </span>
              <span className="pruefungskarte__themen">{p.themen.join(' · ')}</span>
            </button>
          ))}
        </div>

        <fieldset className="modulwahl">
          <legend>Welche Module?</legend>
          {MODULE.map((m) => (
            <label
              key={m.id}
              className={`modulkarte ${module.includes(m.id) ? 'modulkarte--aktiv' : ''}`}
            >
              <input
                type="checkbox"
                checked={module.includes(m.id)}
                onChange={() => umschalten(m.id)}
              />
              <span className="modulkarte__name">{m.label}</span>
              <span className="modulkarte__dauer">
                {STUFEN[stufe].module[m.id].anzeige}
              </span>
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          className="knopf knopf--gross knopf--primaer"
          disabled={!examId || module.length === 0}
          onClick={() =>
            examId &&
            module.length > 0 &&
            // Keep the official module order regardless of the click order.
            onStart(
              examId,
              MODULE.filter((m) => module.includes(m.id)).map((m) => m.id),
            )
          }
        >
          Prüfung starten
          {module.length > 0 && (
            <span className="knopf__zusatz">
              {' '}
              — {module.length} Modul{module.length > 1 ? 'e' : ''}
            </span>
          )}
        </button>

        <details className="kursstufe">
          <summary>
            Was bedeuten {stufe}.1 und {stufe}.2?
          </summary>
          <p className="notiz">
            Kursstufen, keine Prüfungsteile: Das Zertifikat {stufe} ist <em>eine</em>{' '}
            Prüfung aus vier Modulen, die man zusammen oder einzeln ablegen kann. Ein{' '}
            {stufe}.1-Satz ist etwas langsamer gesprochen und stellt die falschen
            Antworten durchsichtiger, ein {stufe}.2-Satz entspricht dem Prüfungstag.
          </p>
        </details>

        <p className="notiz">
          Die Uhr läuft ab dem Start und lässt sich nicht anhalten. Ihre Antworten bleiben
          auf diesem Gerät — ein Neuladen verliert nichts.
        </p>
      </section>
    </div>
  );
}

/** The two chips that say where you are and are the way to somewhere else. */
function Wegweiser({
  stufe,
  modus,
  onStufe,
  onModus,
}: {
  stufe: Stufe;
  modus: Modus | null;
  onStufe: () => void;
  onModus: () => void;
}) {
  return (
    <nav className="wegweiser" aria-label="Auswahl">
      <button type="button" className="wegweiser__chip" onClick={onStufe}>
        {stufe}
        <span className="wegweiser__wechsel">ändern</span>
      </button>
      {modus && (
        <button type="button" className="wegweiser__chip" onClick={onModus}>
          {modus === 'online' ? 'Am Bildschirm' : 'Auf Papier'}
          <span className="wegweiser__wechsel">ändern</span>
        </button>
      )}
    </nav>
  );
}
