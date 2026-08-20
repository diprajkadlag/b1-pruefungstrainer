import { useEffect, useState } from 'react';
import { STUFEN, STUFEN_REIHE, kursstufe, type Stufe } from '@pruefung/core';
import { registryLaden, type RegistryEintrag } from '../lib/content';
import { alleVersuche, loeschen, type GespeicherterVersuch } from '../lib/db';
import { Druckbogen } from '../components/Druckbogen';

export type ModulWahl = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen';

/** Official order, which is also the order a candidate sits them in. */
const MODULE: { id: ModulWahl; label: string }[] = [
  { id: 'lesen', label: 'Lesen' },
  { id: 'hoeren', label: 'Hören' },
  { id: 'schreiben', label: 'Schreiben' },
  { id: 'sprechen', label: 'Sprechen' },
];

const STUFE_GESPEICHERT = 'pruefung-stufe';

interface Props {
  onStart: (examId: string, name: string, module: ModulWahl[]) => void;
  onWeiter: (versuchId: string) => void;
  onErgebnis: (versuchId: string) => void;
  onSpickzettel: (stufe: Stufe) => void;
  onSpiel: (stufe: Stufe) => void;
}

export function Start({ onStart, onWeiter, onErgebnis, onSpickzettel, onSpiel }: Props) {
  const [pruefungen, setPruefungen] = useState<RegistryEintrag[]>([]);
  const [lernhilfeStufen, setLernhilfeStufen] = useState<Stufe[]>([]);
  const [versuche, setVersuche] = useState<GespeicherterVersuch[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  // 'b1-name' is what the key was called before the app grew a second level.
  const [name, setName] = useState(
    localStorage.getItem('pruefung-name') ?? localStorage.getItem('b1-name') ?? '',
  );
  const [stufe, setStufe] = useState<Stufe>(
    (localStorage.getItem(STUFE_GESPEICHERT) as Stufe | null) ?? 'B1',
  );
  const [examId, setExamId] = useState('');
  const [module, setModule] = useState<ModulWahl[]>(['lesen', 'hoeren']);

  useEffect(() => {
    registryLaden()
      .then((r) => {
        setPruefungen(r.pruefungen);
        setLernhilfeStufen(r.lernhilfeStufen ?? []);
      })
      .catch(() =>
        setFehler(
          'Die Prüfungen konnten nicht geladen werden. Wurde ' +
            '„python tools/export_web.py“ ausgeführt?',
        ),
      );
    void alleVersuche().then(setVersuche);
  }, []);

  // Only papers of the chosen level, and never a selection left over from the
  // other one — switching level must not silently start a B1 paper from a B2 tab.
  const sichtbar = pruefungen.filter((p) => p.stufe === stufe);
  useEffect(() => {
    setExamId((cur) =>
      sichtbar.some((p) => p.id === cur) ? cur : (sichtbar[0]?.id ?? ''),
    );
  }, [stufe, pruefungen.length]);

  const gewaehlt = sichtbar.find((p) => p.id === examId);
  const format = STUFEN[stufe];
  const angeboteneStufen = STUFEN_REIHE.filter((s) =>
    pruefungen.some((p) => p.stufe === s),
  );

  function stufeWaehlen(neu: Stufe) {
    setStufe(neu);
    localStorage.setItem(STUFE_GESPEICHERT, neu);
  }

  function umschalten(id: ModulWahl) {
    setModule((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  function starten() {
    if (!examId || module.length === 0) return;
    localStorage.setItem('pruefung-name', name);
    onStart(
      examId,
      name,
      // Keep the official module order regardless of the click order.
      MODULE.filter((m) => module.includes(m.id)).map((m) => m.id),
    );
  }

  return (
    <div className="start">
      <section className="hinweis-box">
        <strong>Keine offizielle Prüfung.</strong> Dieses Übungsmaterial steht in keiner
        Verbindung zum Goethe-Institut e.&nbsp;V., zur telc gGmbH oder zum ÖSD. Alle Texte
        und Aufgaben sind eigens für dieses Projekt verfasst.
      </section>

      {fehler && <p className="fehler">{fehler}</p>}

      {angeboteneStufen.length > 1 && (
        <div className="stufenwahl" role="tablist" aria-label="Prüfungsniveau">
          {angeboteneStufen.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={stufe === s}
              className={`stufe ${stufe === s ? 'stufe--aktiv' : ''}`}
              onClick={() => stufeWaehlen(s)}
            >
              <strong>{s}</strong>
              <span className="stufe__kurz">{STUFEN[s].kurz}</span>
            </button>
          ))}
        </div>
      )}

      {lernhilfeStufen.includes(stufe) && (
        <section className="teil spick__einstieg">
          <div>
            <h2>Spickzettel {stufe}</h2>
            <p className="notiz">
              Strategie für alle vier Module, Redemittel für Sprechen und Schreiben,
              Grammatik in Tabellen und der Grundwortschatz mit allen Verbformen. Zum
              Nachschlagen, ohne eine Prüfung zu starten.
            </p>
          </div>
          <button
            type="button"
            className="knopf knopf--primaer"
            onClick={() => onSpickzettel(stufe)}
          >
            Spickzettel öffnen
          </button>
        </section>
      )}

      {lernhilfeStufen.includes(stufe) && (
        <section className="teil spick__einstieg spiel__einstieg">
          <div>
            <h2>
              <span aria-hidden="true">✨</span> Sprachschatz {stufe}
            </h2>
            <p className="notiz">
              Dieselben Redemittel, Grammatiktabellen und Wörter — aber gefragt statt
              nachgeschlagen. Zwölf Karten pro Runde, drei Leben, und was danebengeht,
              kommt zuerst zurück. Abgefragt zu werden bleibt deutlich besser hängen als
              noch einmal zu lesen.
            </p>
          </div>
          <button
            type="button"
            className="knopf knopf--primaer"
            onClick={() => onSpiel(stufe)}
          >
            Spiel starten
          </button>
        </section>
      )}

      {versuche.some((v) => !v.abgegeben) && (
        <section className="teil">
          <h2>Nicht abgeschlossene Versuche</h2>
          {versuche
            .filter((v) => !v.abgegeben)
            .map((v) => (
              <div className="versuchszeile" key={v.id}>
                <span>
                  {v.examId} · {new Date(v.gestartet).toLocaleString('de-DE')} ·{' '}
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

      {versuche.some((v) => v.abgegeben) && (
        <section className="teil">
          <h2>Frühere Ergebnisse</h2>
          {versuche
            .filter((v) => v.abgegeben)
            .slice(0, 8)
            .map((v) => (
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
        <h2>Neue Prüfung beginnen</h2>

        <label className="feld">
          <span>Name (nur für Ihre Abgabe, bleibt auf diesem Gerät)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Ravi"
          />
        </label>

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

        {sichtbar.length > 0 && (
          <p className="notiz kursstufe">
            <strong>{stufe}.1</strong> und <strong>{stufe}.2</strong> sind Kursstufen,
            keine Prüfungsteile: Das Zertifikat {stufe} ist <em>eine</em> Prüfung aus vier
            Modulen, die man zusammen oder einzeln ablegen kann. Ein {stufe}.1-Satz ist
            etwas langsamer gesprochen und stellt die falschen Antworten durchsichtiger,
            ein {stufe}.2-Satz entspricht dem Prüfungstag.
          </p>
        )}

        <fieldset className="modulwahl">
          <legend>Welche Module möchten Sie ablegen?</legend>
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
              <span className="modulkarte__dauer">{format.module[m.id].anzeige}</span>
            </label>
          ))}
        </fieldset>

        {module.includes('sprechen') && !window.isSecureContext && (
          <p className="fehler">
            Für das Modul Sprechen braucht der Browser eine sichere Verbindung. Über
            <code> http://localhost </code> funktioniert es; über eine IP-Adresse im
            Netzwerk sperrt der Browser das Mikrofon.
          </p>
        )}

        <button
          type="button"
          className="knopf knopf--gross knopf--primaer"
          disabled={!examId || module.length === 0}
          onClick={starten}
        >
          Prüfung starten
          {gewaehlt && module.length > 0 && (
            <span className="knopf__zusatz">
              {' '}
              — {module.length} Modul{module.length > 1 ? 'e' : ''}
            </span>
          )}
        </button>

        {gewaehlt && (
          <Druckbogen
            examId={gewaehlt.id}
            dateien={gewaehlt.pdfsVorAbgabe}
            titel="Lieber auf Papier?"
            hinweis={
              'Diese Prüfung als PDF — zum Ausdrucken und offline Schreiben. ' +
              'Das Lösungsheft erscheint nach der Abgabe auf der Ergebnisseite.'
            }
          />
        )}

        <p className="notiz">
          Der Timer läuft ab dem Start und lässt sich nicht anhalten. Ihre Antworten
          werden laufend auf diesem Gerät gespeichert — ein Neuladen verliert nichts.
        </p>
      </section>
    </div>
  );
}
