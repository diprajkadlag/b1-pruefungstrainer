import { useState } from 'react';
import type { Sprechaufgabe, Sprechtraining as Daten } from '@pruefung/core';

/**
 * The speaking trainer.
 *
 * Fifty tasks, each with the German background a candidate from outside the
 * country cannot invent, and model answers timed to the three minutes the exam
 * actually gives.
 *
 * The one design decision worth defending: **the answers start hidden.** They
 * are not secret — this is a practice book and the whole second half is
 * solutions — but a model answer read before you have spoken is a text you
 * agree with rather than something you produced. The card opens on the task
 * alone, with a timer, and the culture note and model answers are one tap
 * away when the learner decides they are done.
 */

interface Props {
  daten: Daten;
  onZurueck: () => void;
}

type Sicht = 'aufgabe' | 'kultur' | 'loesung';

function Zeit({ sekunden }: { sekunden: number }) {
  const min = Math.floor(sekunden / 60);
  const sek = sekunden % 60;
  return (
    <>
      {min}:{String(sek).padStart(2, '0')} Min.
    </>
  );
}

function Karte({ aufgabe, folien }: { aufgabe: Sprechaufgabe; folien: string[] }) {
  const [sicht, setSicht] = useState<Sicht>('aufgabe');

  return (
    <article className="sprech">
      <header className="sprech__kopf">
        <span className="sprech__nr">{aufgabe.nummer}</span>
        <h2>{aufgabe.teil2.titel}</h2>
      </header>

      <div className="sprech__tabs" role="tablist">
        {(
          [
            ['aufgabe', 'Aufgabe'],
            ['kultur', 'So ist es in Deutschland'],
            ['loesung', 'Musterlösung'],
          ] as [Sicht, string][]
        ).map(([wert, label]) => (
          <button
            type="button"
            key={wert}
            role="tab"
            aria-selected={sicht === wert}
            className={`knopf knopf--tab ${sicht === wert ? 'knopf--aktiv' : ''}`}
            onClick={() => setSicht(wert)}
          >
            {label}
          </button>
        ))}
      </div>

      {sicht === 'aufgabe' && (
        <div className="sprech__inhalt">
          <p className="notiz">
            Erst sprechen, dann nachlesen. 15 Minuten Vorbereitung, dann Teil 1 bis 3 am
            Stück — so wie in der Prüfung.
          </p>

          <h3>Teil 1 — Gemeinsam etwas planen · ca. 3 Min.</h3>
          <p className="situation">{aufgabe.teil1.situation}</p>
          <ol className="sprech__punkte">
            {aufgabe.teil1.punkte.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>

          <h3>Teil 2 — Ein Thema präsentieren · ca. 3 Min.</h3>
          <p className="sprech__thema">{aufgabe.teil2.titel}</p>
          <ol className="sprech__punkte">
            {folien.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>

          <h3>Teil 3 — Über ein Thema sprechen · ca. 2 Min.</h3>
          <p>
            Geben Sie eine Rückmeldung zur Präsentation Ihres Partners / Ihrer Partnerin,
            stellen Sie eine Frage und beantworten Sie danach seine / ihre Frage.
          </p>
        </div>
      )}

      {sicht === 'kultur' && (
        <div className="sprech__inhalt">
          <div className="kulturkasten">
            <p>{aufgabe.teil2.kultur.de}</p>
            <p className="kulturkasten__en">{aufgabe.teil2.kultur.en}</p>
          </div>

          <h3>Wortschatz zum Thema</h3>
          <table className="sprech__wortschatz">
            <tbody>
              {aufgabe.teil2.wortschatz.map((w) => (
                <tr key={w.de}>
                  <td>{w.de}</td>
                  <td className="sprech__gloss">{w.en}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sicht === 'loesung' && (
        <div className="sprech__inhalt">
          <h3>Teil 1 — ein möglicher Dialog</h3>
          <div className="sprech__dialog">
            {aufgabe.teil1.musterdialog.map((z, i) => (
              <p key={i}>
                <b>{z.wer}:</b> {z.text}
              </p>
            ))}
          </div>

          <h3>
            Teil 2 — Musterlösung{' '}
            <span className="sprech__umfang">
              {aufgabe.teil2.umfang.woerter} Wörter · etwa{' '}
              <Zeit sekunden={aufgabe.teil2.umfang.sprechzeitSekunden} /> gesprochen
            </span>
          </h3>
          {aufgabe.teil2.musterloesung.map((block, i) => (
            <div key={i}>
              <p className="sprech__folie">Folie {i + 1}</p>
              <p>{block}</p>
            </div>
          ))}

          <h3>Teil 3 — Rückmeldung, Frage, Antwort</h3>
          <div className="sprech__dialog">
            <p>
              <b>1.</b> {aufgabe.teil3.rueckmeldung}
            </p>
            <p>
              <b>2.</b> {aufgabe.teil3.frage}
            </p>
            <p>
              <b>3.</b> {aufgabe.teil3.antwort}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

export function Sprechtraining({ daten, onZurueck }: Props) {
  const [offen, setOffen] = useState<number | null>(null);
  const [suche, setSuche] = useState('');

  const gefiltert = daten.aufgaben.filter((a) => {
    const q = suche.trim().toLowerCase();
    if (!q) return true;
    return (
      a.teil2.titel.toLowerCase().includes(q) ||
      a.kurz.toLowerCase().includes(q) ||
      a.teil2.wortschatz.some((w) => w.de.toLowerCase().includes(q))
    );
  });

  const aufgabe = offen !== null ? daten.aufgaben.find((a) => a.nummer === offen) : null;

  if (aufgabe) {
    return (
      <div className="sprech__seite">
        <button
          type="button"
          className="knopf knopf--sekundaer"
          onClick={() => setOffen(null)}
        >
          ← Alle Aufgaben
        </button>
        <Karte aufgabe={aufgabe} folien={daten.folien} />
        <div className="sprech__blaettern">
          <button
            type="button"
            className="knopf"
            disabled={aufgabe.nummer <= 1}
            onClick={() => setOffen(aufgabe.nummer - 1)}
          >
            ← Aufgabe {aufgabe.nummer - 1}
          </button>
          <button
            type="button"
            className="knopf"
            disabled={aufgabe.nummer >= daten.aufgaben.length}
            onClick={() => setOffen(aufgabe.nummer + 1)}
          >
            Aufgabe {aufgabe.nummer + 1} →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sprech__seite">
      <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
        ← Zurück zur Übersicht
      </button>

      <h1>{daten.titel}</h1>
      <p className="notiz">{daten.hinweis}</p>

      <input
        className="spick__suche"
        type="search"
        placeholder="Thema oder Wort suchen …"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        aria-label="Sprechaufgaben durchsuchen"
      />

      <p className="notiz">
        {gefiltert.length} von {daten.aufgaben.length} Aufgaben
      </p>

      <ol className="sprech__liste">
        {gefiltert.map((a) => (
          <li key={a.nummer}>
            <button
              type="button"
              className="sprech__eintrag"
              onClick={() => setOffen(a.nummer)}
            >
              <span className="sprech__nr">{a.nummer}</span>
              <span>
                <b>{a.teil2.titel}</b>
                <span className="sprech__kurz">{a.kurz}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
