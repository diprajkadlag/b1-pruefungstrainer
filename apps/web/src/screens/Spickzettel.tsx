/**
 * The cheat sheet, in the app.
 *
 * Same content as spickzettel.pdf, rendered from the same JSON — this is the
 * version you read on a phone on the way to the exam, the PDF is the one you
 * print and scribble on. Five tabs rather than one long scroll, because the
 * whole point is finding the one Redemittel block you half-remember.
 */

import { useState } from 'react';
import type { Lernhilfe, Tabelle } from '@b1/core';

const REITER = [
  'ueberblick',
  'strategie',
  'redemittel',
  'grammatik',
  'wortschatz',
] as const;
type Reiter = (typeof REITER)[number];

const REITER_NAME: Record<Reiter, string> = {
  ueberblick: 'Überblick',
  strategie: 'Strategie',
  redemittel: 'Redemittel',
  grammatik: 'Grammatik',
  wortschatz: 'Wortschatz',
};

/**
 * The content marks the decisive word of a line with **…** — the changed vowel,
 * the case that governs. Rendering it as <strong> keeps that emphasis without
 * putting HTML in the content files, which the LaTeX build also reads.
 */
function Betont({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\*\*(.+?)\*\*/g)
        .map((teil, i) =>
          i % 2 === 1 ? <strong key={i}>{teil}</strong> : <span key={i}>{teil}</span>,
        )}
    </>
  );
}

function Gitter({ tabelle }: { tabelle: Tabelle }) {
  return (
    <div className="tabelle-rahmen">
      <table className="glossartabelle spick__tabelle">
        <thead>
          <tr>
            {tabelle.kopf.map((k, i) => (
              <th key={i}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabelle.zeilen.map((zeile, i) => (
            <tr key={i}>
              {zeile.map((zelle, j) => (
                <td key={j}>
                  <Betont text={zelle} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Spickzettel({
  lernhilfe,
  onZurueck,
}: {
  lernhilfe: Lernhilfe;
  onZurueck: () => void;
}) {
  const [reiter, setReiter] = useState<Reiter>('ueberblick');
  const [suche, setSuche] = useState('');

  const q = suche.trim().toLowerCase();
  const passt = (...felder: string[]) =>
    !q || felder.some((f) => f.toLowerCase().includes(q));

  return (
    <section className="spick">
      <div className="spick__kopf">
        <div>
          <h1>{lernhilfe.titel}</h1>
          <p className="notiz">{lernhilfe.untertitel}</p>
        </div>
        <button type="button" className="knopf" onClick={onZurueck}>
          Zurück zur Übersicht
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {REITER.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={reiter === r}
            className={`knopf knopf--tab ${reiter === r ? 'knopf--aktiv' : ''}`}
            onClick={() => setReiter(r)}
          >
            {REITER_NAME[r]}
          </button>
        ))}
      </nav>

      {(reiter === 'redemittel' || reiter === 'wortschatz') && (
        <input
          type="search"
          className="spick__suche"
          placeholder={
            reiter === 'redemittel'
              ? 'Redemittel durchsuchen, z. B. „vorschlagen“ …'
              : 'Wort durchsuchen, deutsch oder englisch …'
          }
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
      )}

      {reiter === 'ueberblick' && (
        <>
          <p>{lernhilfe.ueberblick.einleitung}</p>
          <div className="tabelle-rahmen">
            <table className="glossartabelle spick__tabelle">
              <thead>
                <tr>
                  <th>Modul</th>
                  <th>Zeit</th>
                  <th>Umfang</th>
                  <th>Punkte</th>
                  <th>Das Wichtigste</th>
                </tr>
              </thead>
              <tbody>
                {lernhilfe.ueberblick.module.map((m) => (
                  <tr key={m.modul}>
                    <th scope="row">{m.modul}</th>
                    <td>{m.zeit}</td>
                    <td>{m.teile}</td>
                    <td>{m.punkte}</td>
                    <td>{m.kern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Notenskala</h2>
          <ul className="spick__noten">
            {lernhilfe.ueberblick.noten.map((n) => (
              <li key={n.note}>
                <span>{n.note}</span>
                <span>
                  {n.bis}–{n.von} Punkte
                </span>
              </li>
            ))}
          </ul>
          <p className="merke">
            <strong>60 von 100</strong> in jedem Modul — bei Lesen und Hören sind das{' '}
            <strong>18 von 30</strong> richtigen Aufgaben. Module werden einzeln bestanden
            und können einzeln wiederholt werden.
          </p>
        </>
      )}

      {reiter === 'strategie' &&
        lernhilfe.strategie.map((s) => (
          <article key={s.modul} className="spick__block">
            <h2>{s.modul}</h2>
            <p className="notiz">{s.zeitplan}</p>
            <ul className="spick__regeln">
              {s.goldregeln.map((g, i) => (
                <li key={i}>
                  <Betont text={g} />
                </li>
              ))}
            </ul>

            {s.tipps && (
              <dl className="spick__liste">
                {s.tipps.map((t) => (
                  <div key={t.teil}>
                    <dt>{t.teil}</dt>
                    <dd>
                      <Betont text={t.text} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {s.aufgaben?.map((a) => (
              <div key={a.aufgabe} className="spick__karte">
                <h3>{a.aufgabe}</h3>
                <p>
                  <strong>Aufbau:</strong> {a.aufbau}
                </p>
                <p className="notiz">
                  <Betont text={a.hinweis} />
                </p>
              </div>
            ))}

            {s.teile?.map((t) => (
              <div key={t.teil} className="spick__karte">
                <h3>{t.teil}</h3>
                <p>
                  <strong>Ziel:</strong> {t.ziel}
                </p>
                <p>
                  <strong>Ablauf:</strong> {t.ablauf}
                </p>
                <p className="notiz">
                  <strong>Achtung:</strong> <Betont text={t.achtung} />
                </p>
              </div>
            ))}

            {s.fehlerliste && (
              <>
                <h3>Die Fehler, die am meisten Punkte kosten</h3>
                <ul className="spick__fehler">
                  {s.fehlerliste.map((f, i) => (
                    <li key={i}>
                      <span className="spick__falsch">{f.falsch}</span>
                      <span className="spick__richtig">{f.richtig}</span>
                      <span className="notiz">{f.grund}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}

      {reiter === 'redemittel' &&
        lernhilfe.redemittel.map((r) => {
          const gruppen = r.gruppen
            .map((g) => ({
              ...g,
              phrasen: g.phrasen.filter((p) => passt(p, g.funktion)),
            }))
            .filter((g) => g.phrasen.length > 0);
          if (gruppen.length === 0) return null;
          return (
            <article key={r.bereich} className="spick__block">
              <h2>{r.bereich}</h2>
              <div className="spick__spalten">
                {gruppen.map((g) => (
                  <div key={g.funktion} className="spick__karte">
                    <h3>{g.funktion}</h3>
                    <ul>
                      {g.phrasen.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          );
        })}

      {reiter === 'grammatik' &&
        lernhilfe.grammatik.map((g) => (
          <article key={g.thema} className="spick__block">
            <h2>{g.thema}</h2>
            <p>{g.erklaerung}</p>
            <Gitter tabelle={g.tabelle} />
          </article>
        ))}

      {reiter === 'wortschatz' && (
        <>
          <p className="merke">
            <Betont text={lernhilfe.wortschatz.hinweis} />
          </p>

          <h2>Verben</h2>
          {lernhilfe.wortschatz.verben.map((gruppe) => {
            const treffer = gruppe.eintraege.filter((v) => passt(v.inf, v.en, v.bsp));
            if (treffer.length === 0) return null;
            return (
              <div key={gruppe.gruppe} className="spick__block">
                <h3>{gruppe.gruppe}</h3>
                <div className="tabelle-rahmen">
                  <table className="glossartabelle spick__tabelle">
                    <thead>
                      <tr>
                        <th>Infinitiv</th>
                        <th>Englisch</th>
                        <th>er/sie/es</th>
                        <th>Präteritum</th>
                        <th>Perfekt</th>
                        <th>Beispiel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {treffer.map((v) => (
                        <tr key={v.inf}>
                          <th scope="row">
                            {v.inf}
                            {v.unreg && (
                              <abbr title="unregelmäßig" className="spick__unreg">
                                {' '}
                                ▲
                              </abbr>
                            )}
                          </th>
                          <td>{v.en}</td>
                          <td>{v.er}</td>
                          <td>{v['prät']}</td>
                          <td>{v.perf}</td>
                          <td>
                            <Betont text={v.bsp} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <h2>Nomen</h2>
          {lernhilfe.wortschatz.nomen.map((gruppe) => {
            const treffer = gruppe.eintraege.filter((n) => passt(n.wort, n.en));
            if (treffer.length === 0) return null;
            return (
              <div key={gruppe.gruppe} className="spick__block">
                <h3>{gruppe.gruppe}</h3>
                <div className="tabelle-rahmen">
                  <table className="glossartabelle spick__tabelle">
                    <thead>
                      <tr>
                        <th>Artikel</th>
                        <th>Nomen</th>
                        <th>Plural</th>
                        <th>Englisch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {treffer.map((n) => (
                        <tr key={n.wort}>
                          <td>{n.art}</td>
                          <th scope="row">{n.wort}</th>
                          <td>{n.pl}</td>
                          <td>{n.en}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <h2>Adjektive</h2>
          <div className="tabelle-rahmen">
            <table className="glossartabelle spick__tabelle">
              <thead>
                <tr>
                  <th>Adjektiv</th>
                  <th>Gegenteil</th>
                  <th>Englisch</th>
                </tr>
              </thead>
              <tbody>
                {lernhilfe.wortschatz.adjektive
                  .filter((a) => passt(a.wort, a.gegenteil, a.en))
                  .map((a) => (
                    <tr key={a.wort}>
                      <th scope="row">{a.wort}</th>
                      <td>{a.gegenteil}</td>
                      <td>{a.en}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h2>Die kleinen Wörter</h2>
          {lernhilfe.wortschatz.kleineWoerter
            .filter((k) => passt(k.gruppe, k.woerter))
            .map((k) => (
              <div key={k.gruppe} className="spick__karte">
                <h3>{k.gruppe}</h3>
                <p>{k.woerter}</p>
              </div>
            ))}
        </>
      )}
    </section>
  );
}
