import { useState } from 'react';
import type {
  Sprechaufgabe,
  SprechaufgabeB2,
  Sprechtraining as Daten,
  SprechthemaB2,
} from '@pruefung/core';

/**
 * The speaking trainer, for B1 and B2.
 *
 * The two levels share a shell — a searchable list, a card, paging — and
 * almost nothing else, because they are different examinations. B1 is three
 * parts: plan something together, present one topic over five slides, give
 * feedback. B2 is two: a four-minute solo Vortrag where the candidate picks
 * one of two offered topics, then a five-minute debate where the partner
 * argues back. So the shell is shared and the card body is not.
 *
 * The one design decision worth defending, and it holds at both levels: **the
 * answers start hidden.** They are not secret — this is a practice book and
 * the whole second half is solutions — but a model answer read before you have
 * spoken is a text you agree with rather than something you produced. The card
 * opens on the task; the culture note and the model answers are one tap away
 * when the learner decides they are done.
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

function Wortschatz({ eintraege }: { eintraege: { de: string; en: string }[] }) {
  return (
    <table className="sprech__wortschatz">
      <tbody>
        {eintraege.map((w) => (
          <tr key={w.de}>
            <td>{w.de}</td>
            <td className="sprech__gloss">{w.en}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Kultur({ kultur }: { kultur: { de: string; en: string } }) {
  return (
    <div className="kulturkasten">
      <p>{kultur.de}</p>
      <p className="kulturkasten__en">{kultur.en}</p>
    </div>
  );
}

function Tabs({ sicht, setSicht }: { sicht: Sicht; setSicht: (s: Sicht) => void }) {
  const tabs: [Sicht, string][] = [
    ['aufgabe', 'Aufgabe'],
    ['kultur', 'So ist es in Deutschland'],
    ['loesung', 'Musterlösung'],
  ];
  return (
    <div className="sprech__tabs" role="tablist">
      {tabs.map(([wert, label]) => (
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
  );
}

// --- B1: plan together, present five slides, give feedback ------------------

function KarteB1({ aufgabe, folien }: { aufgabe: Sprechaufgabe; folien: string[] }) {
  const [sicht, setSicht] = useState<Sicht>('aufgabe');

  return (
    <article className="sprech">
      <header className="sprech__kopf">
        <span className="sprech__nr">{aufgabe.nummer}</span>
        <h2>{aufgabe.teil2.titel}</h2>
      </header>

      <Tabs sicht={sicht} setSicht={setSicht} />

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
          <Kultur kultur={aufgabe.teil2.kultur} />
          <h3>Wortschatz zum Thema</h3>
          <Wortschatz eintraege={aufgabe.teil2.wortschatz} />
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

// --- B2: choose one of two topics, talk, then argue -------------------------

function ThemaLoesung({
  thema,
  gliederung,
  nummer,
}: {
  thema: SprechthemaB2;
  gliederung: string[];
  nummer: number;
}) {
  return (
    <>
      <h3>
        Thema {nummer} — {thema.titel}{' '}
        <span className="sprech__umfang">
          {thema.umfang.woerter} Wörter · etwa{' '}
          <Zeit sekunden={thema.umfang.sprechzeitSekunden} /> gesprochen
        </span>
      </h3>
      {thema.musterloesung.map((block, i) => (
        <div key={i}>
          <p className="sprech__folie">
            {gliederung[i]?.split(' — ')[0] ?? `Teil ${i + 1}`}
          </p>
          <p>{block}</p>
        </div>
      ))}
    </>
  );
}

function KarteB2({
  aufgabe,
  gliederung,
}: {
  aufgabe: SprechaufgabeB2;
  gliederung: string[];
}) {
  const [sicht, setSicht] = useState<Sicht>('aufgabe');

  return (
    <article className="sprech">
      <header className="sprech__kopf">
        <span className="sprech__nr">{aufgabe.nummer}</span>
        <h2>{aufgabe.kurz}</h2>
      </header>

      <Tabs sicht={sicht} setSicht={setSicht} />

      {sicht === 'aufgabe' && (
        <div className="sprech__inhalt">
          <p className="notiz">
            Erst sprechen, dann nachlesen. 15 Minuten Vorbereitung für beide Teile —
            wählen Sie in Teil 1 schnell ein Thema und bleiben Sie dann dabei.
          </p>

          <h3>Teil 1 — Einen Vortrag halten · ca. 4 Min. · 50 Punkte</h3>
          <p className="notiz">Wählen Sie eines der beiden Themen.</p>
          {aufgabe.teil1.themen.map((t, i) => (
            <div className="sprech__wahl" key={t.titel}>
              <span className="sprech__wahlnr">Thema {i + 1}</span>
              <b>{t.titel}</b>
            </div>
          ))}
          <ol className="sprech__punkte">
            {gliederung.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ol>

          <h3>Teil 2 — Eine Debatte führen · ca. 5 Min. · 50 Punkte</h3>
          <p className="sprech__thema">{aufgabe.teil2.frage}</p>
          <ol className="sprech__punkte">
            {aufgabe.teil2.punkte.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </div>
      )}

      {sicht === 'kultur' && (
        <div className="sprech__inhalt">
          {aufgabe.teil1.themen.map((t, i) => (
            <div key={t.titel}>
              <h3>
                Thema {i + 1} — {t.titel}
              </h3>
              <Kultur kultur={t.kultur} />
              <Wortschatz eintraege={t.wortschatz} />
            </div>
          ))}
          <h3>Zur Debatte — {aufgabe.teil2.frage}</h3>
          <Kultur kultur={aufgabe.teil2.kultur} />
        </div>
      )}

      {sicht === 'loesung' && (
        <div className="sprech__inhalt">
          {aufgabe.teil1.themen.map((t, i) => (
            <ThemaLoesung
              key={t.titel}
              thema={t}
              gliederung={gliederung}
              nummer={i + 1}
            />
          ))}

          <h3>Die Nachfragen der Prüferin</h3>
          <div className="sprech__dialog">
            {aufgabe.teil1.fragen.map((f, i) => (
              <p key={f}>
                <b>{i + 1}.</b> <i>{f}</i>
                <br />
                {aufgabe.teil1.antwortenAufFragen[i]}
              </p>
            ))}
          </div>

          <h3>
            Teil 2 — Musterdiskussion{' '}
            <span className="sprech__umfang">
              {aufgabe.teil2.umfang.woerter} Wörter zu zweit
            </span>
          </h3>
          <div className="sprech__dialog">
            {aufgabe.teil2.musterdialog.map((z, i) => (
              <p key={i}>
                <b>{z.wer}:</b> {z.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// --- the shared shell -------------------------------------------------------

/** What the list shows and the search matches, whichever level it is. */
function zeile(
  daten: Daten,
  nummer: number,
): { titel: string; kurz: string; woerter: string[] } {
  if (daten.stufe === 'B2') {
    const a = daten.aufgaben.find((x) => x.nummer === nummer)!;
    return {
      titel: a.teil1.themen.map((t) => t.titel).join('  ·  '),
      kurz: `${a.kurz} — Debatte: ${a.teil2.frage}`,
      woerter: a.teil1.themen.flatMap((t) => t.wortschatz.map((w) => w.de)),
    };
  }
  const a = daten.aufgaben.find((x) => x.nummer === nummer)!;
  return {
    titel: a.teil2.titel,
    kurz: a.kurz,
    woerter: a.teil2.wortschatz.map((w) => w.de),
  };
}

export function Sprechtraining({ daten, onZurueck }: Props) {
  const [offen, setOffen] = useState<number | null>(null);
  const [suche, setSuche] = useState('');

  const nummern = daten.aufgaben.map((a) => a.nummer);
  const gefiltert = nummern.filter((nr) => {
    const q = suche.trim().toLowerCase();
    if (!q) return true;
    const z = zeile(daten, nr);
    return (
      z.titel.toLowerCase().includes(q) ||
      z.kurz.toLowerCase().includes(q) ||
      z.woerter.some((w) => w.toLowerCase().includes(q))
    );
  });

  if (offen !== null && nummern.includes(offen)) {
    return (
      <div className="sprech__seite">
        <button
          type="button"
          className="knopf knopf--sekundaer"
          onClick={() => setOffen(null)}
        >
          ← Alle Aufgaben
        </button>

        {daten.stufe === 'B2' ? (
          <KarteB2
            aufgabe={daten.aufgaben.find((a) => a.nummer === offen)!}
            gliederung={daten.gliederung}
          />
        ) : (
          <KarteB1
            aufgabe={daten.aufgaben.find((a) => a.nummer === offen)!}
            folien={daten.folien}
          />
        )}

        <div className="sprech__blaettern">
          <button
            type="button"
            className="knopf"
            disabled={offen <= 1}
            onClick={() => setOffen(offen - 1)}
          >
            ← Aufgabe {offen - 1}
          </button>
          <button
            type="button"
            className="knopf"
            disabled={offen >= nummern.length}
            onClick={() => setOffen(offen + 1)}
          >
            Aufgabe {offen + 1} →
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
        {gefiltert.map((nr) => {
          const z = zeile(daten, nr);
          return (
            <li key={nr}>
              <button
                type="button"
                className="sprech__eintrag"
                onClick={() => setOffen(nr)}
              >
                <span className="sprech__nr">{nr}</span>
                <span>
                  <b>{z.titel}</b>
                  <span className="sprech__kurz">{z.kurz}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
