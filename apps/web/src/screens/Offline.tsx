import { useState } from 'react';
import type { Stufe } from '@pruefung/core';
import {
  PDF_BESCHREIBUNG,
  PDF_TITEL,
  RELEASE_URL,
  STUFEN_PDF_BESCHREIBUNG,
  STUFEN_PDF_TITEL,
  pdfUrl,
  stufenPdfUrl,
  type PdfName,
  type RegistryEintrag,
  type StufenPdfName,
} from '../lib/content';

interface Blatt {
  schluessel: string;
  titel: string;
  beschreibung: string;
  url: string;
}

/**
 * Everything printable for one level, to read here or to take away.
 *
 * A learner who chose paper wants two things and no detour to either: to see
 * what is in a booklet before spending ink on it, and to get the file. So each
 * sheet offers both, and the viewer opens in place rather than on another
 * screen — an embedded PDF that some mobile browsers refuse to render, which
 * is why the frame always carries a plain link out as well.
 */
export function Offline({
  stufe,
  pruefungen,
  stufenPdfs,
}: {
  stufe: Stufe;
  pruefungen: RegistryEintrag[];
  stufenPdfs: StufenPdfName[];
}) {
  const [offen, setOffen] = useState<string | null>(null);
  const [speichern, setSpeichern] = useState<'nein' | 'laeuft' | 'fertig'>('nein');

  const lernblaetter: Blatt[] = stufenPdfs.map((name) => ({
    schluessel: `stufe-${name}`,
    titel: `${STUFEN_PDF_TITEL[name]} ${stufe}`,
    beschreibung: STUFEN_PDF_BESCHREIBUNG[name],
    url: stufenPdfUrl(stufe, name),
  }));

  function blaetterZu(p: RegistryEintrag, namen: PdfName[]): Blatt[] {
    return namen.map((name) => ({
      schluessel: `${p.id}-${name}`,
      titel: PDF_TITEL[name],
      beschreibung: PDF_BESCHREIBUNG[name],
      url: pdfUrl(p.id, name),
    }));
  }

  const alle = [
    ...lernblaetter,
    ...pruefungen.flatMap((p) =>
      blaetterZu(p, [...p.pdfsVorAbgabe, ...p.pdfsNachAbgabe]),
    ),
  ];

  /**
   * Warm the service worker cache so the whole shelf survives a flight or a
   * train. The worker already caches PDFs it sees; this just makes it see them
   * all at once, on a connection the learner chose.
   */
  async function fuerOfflineSpeichern() {
    setSpeichern('laeuft');
    for (const b of alle) {
      try {
        await fetch(b.url, { cache: 'force-cache' });
      } catch {
        // One unavailable sheet must not abort the rest.
      }
    }
    setSpeichern('fertig');
  }

  if (alle.length === 0) {
    return (
      <section className="teil">
        <h2>Auf Papier</h2>
        <p className="notiz">
          Für diese Installation wurden keine PDFs erzeugt. Alle Prüfungsbögen,
          Spickzettel und Sprechtrainings liegen beim{' '}
          <a href={RELEASE_URL} target="_blank" rel="noreferrer">
            neuesten Release
          </a>
          . Wer sie selbst bauen möchte: <code>npm run content:pdf</code> (braucht LaTeX).
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="teil papier__kopf">
        <div>
          <h2>Zum Lesen und Ausdrucken</h2>
          <p className="notiz">
            Jedes Heft können Sie hier ansehen oder herunterladen. Einmal gespeichert,
            funktioniert alles auch ohne Internet.
          </p>
        </div>
        <button
          type="button"
          className="knopf knopf--primaer"
          onClick={() => void fuerOfflineSpeichern()}
          disabled={speichern !== 'nein'}
        >
          {speichern === 'nein' && 'Alles für offline speichern'}
          {speichern === 'laeuft' && 'Wird gespeichert …'}
          {speichern === 'fertig' && '✓ Offline verfügbar'}
        </button>
      </section>

      {lernblaetter.length > 0 && (
        <section className="teil">
          <h3 className="papier__gruppe">Lernmaterial</h3>
          <Blattliste
            blaetter={lernblaetter}
            offen={offen}
            onOeffnen={(k) => setOffen((cur) => (cur === k ? null : k))}
          />
        </section>
      )}

      <section className="teil">
        <h3 className="papier__gruppe">Prüfungen</h3>
        {pruefungen.map((p) => (
          <details className="papier__pruefung" key={p.id}>
            <summary>{p.titel}</summary>
            <p className="notiz">{p.themen.join(' · ')}</p>
            <Blattliste
              blaetter={blaetterZu(p, p.pdfsVorAbgabe)}
              offen={offen}
              onOeffnen={(k) => setOffen((cur) => (cur === k ? null : k))}
            />
            {p.pdfsNachAbgabe.length > 0 && (
              <div className="papier__loesung">
                <p className="notiz">
                  <strong>Zum Nachkorrigieren.</strong> Erst ansehen, wenn Sie die
                  Aufgaben gemacht haben.
                </p>
                <Blattliste
                  blaetter={blaetterZu(p, p.pdfsNachAbgabe)}
                  offen={offen}
                  onOeffnen={(k) => setOffen((cur) => (cur === k ? null : k))}
                />
              </div>
            )}
          </details>
        ))}
      </section>
    </>
  );
}

function Blattliste({
  blaetter,
  offen,
  onOeffnen,
}: {
  blaetter: Blatt[];
  offen: string | null;
  onOeffnen: (schluessel: string) => void;
}) {
  return (
    <ul className="papier__liste">
      {blaetter.map((b) => (
        <li className="papier__blatt" key={b.schluessel}>
          <div className="papier__zeile">
            <span className="papier__text">
              <strong>{b.titel}</strong>
              <span className="notiz">{b.beschreibung}</span>
            </span>
            <span className="papier__knoepfe">
              <button
                type="button"
                className="knopf"
                aria-expanded={offen === b.schluessel}
                onClick={() => onOeffnen(b.schluessel)}
              >
                {offen === b.schluessel ? 'Schließen' : 'Ansehen'}
              </button>
              <a className="knopf knopf--primaer" href={b.url} download>
                Herunterladen
              </a>
            </span>
          </div>

          {offen === b.schluessel && (
            <div className="papier__leser">
              <object data={b.url} type="application/pdf" aria-label={b.titel}>
                <p className="notiz">
                  Dieser Browser zeigt PDFs nicht direkt an — bitte öffnen oder
                  herunterladen.
                </p>
              </object>
              <p className="papier__mobil notiz">
                Auf dem Handy zeigen Browser PDFs meist nicht in der Seite. Öffnen Sie das
                Heft in einem neuen Tab oder laden Sie es herunter.
              </p>
              <a
                className="papier__vollbild"
                href={b.url}
                target="_blank"
                rel="noreferrer"
              >
                In neuem Tab öffnen
              </a>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
