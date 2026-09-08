import { useMemo, useState } from 'react';
import {
  bewerteModul,
  schwachstellen,
  type ModulErgebnis,
  type OeffentlichePruefung,
  type Schluesseldaten,
} from '@pruefung/core';
import type { GespeicherterVersuch } from '../lib/db';
import { ankiTsv } from '../lib/anki';
import { herunterladen } from '../lib/datei';
import type { PdfName } from '../lib/content';
import { Druckbogen } from '../components/Druckbogen';

interface Props {
  pruefung: OeffentlichePruefung;
  schluessel: Schluesseldaten;
  versuch: GespeicherterVersuch;
  /** Printables that only make sense now the attempt is closed. */
  loesungsPdfs: PdfName[];
  onNeustart: () => void;
}

const KOMPETENZ_NAME: Record<string, string> = {
  detailverstehen: 'Detailverstehen',
  globalverstehen: 'Globalverstehen',
  selektivverstehen: 'Selektives Verstehen',
  meinung_haltung: 'Meinung und Haltung erkennen',
  zuordnen: 'Zuordnen',
  textstruktur: 'Textaufbau erkennen',
};

const KOMPETENZ_RAT: Record<string, string> = {
  detailverstehen:
    'Achten Sie auf einzelne Wörter, die alles umdrehen: nicht, nie, kaum, erst, nur. ' +
    'Markieren Sie beim Lesen die Stelle, die Ihre Antwort belegt.',
  globalverstehen:
    'Lesen oder hören Sie zuerst einmal ganz durch, ohne auf Details zu achten, und ' +
    'fassen Sie den Text in einem Satz zusammen. Danach die Aufgaben.',
  selektivverstehen:
    'Suchen Sie gezielt nach der Information aus der Frage, statt alles zu lesen. ' +
    'Bei Ordnungen und Regeln hilft es, zuerst den passenden Paragrafen zu finden.',
  meinung_haltung:
    'Entscheidend ist der letzte Satz, nicht der erste. Viele Beiträge beginnen mit ' +
    'der Gegenposition („Ich war skeptisch …“) und drehen dann.',
  zuordnen:
    'Prüfen Sie bei jeder Zuordnung alle Bedingungen, nicht nur eine. Arbeiten Sie ' +
    'die sicheren Treffer zuerst ab und streichen Sie, was schon vergeben ist — was ' +
    'übrig bleibt, ist am Ende die schwerste Entscheidung.',
  textstruktur:
    'Hier zählt nicht der Inhalt, sondern der Anschluss. Sehen Sie sich an, was ' +
    'unmittelbar vor und nach der Lücke steht: Pronomen, Konnektoren („deshalb“, ' +
    '„allerdings“) und wiederaufgenommene Wörter verraten, welcher Satz passt.',
};

export function Ergebnis({
  pruefung,
  schluessel,
  versuch,
  loesungsPdfs,
  onNeustart,
}: Props) {
  const [tab, setTab] = useState<'uebersicht' | 'loesungen' | 'glossar' | 'grammatik'>(
    'uebersicht',
  );

  // The level decides what a module is worth and whether it carries a verdict
  // of its own: 100 points and a pass mark at B1 and B2, 25 points and no
  // separate verdict at A2, which is passed as one examination.
  const stufe = pruefung.meta.stufe;

  const lesen = useMemo(
    () => bewerteModul('lesen', versuch.antworten.lesen, schluessel.keys, stufe),
    [versuch, schluessel, stufe],
  );
  const hoeren = useMemo(
    () => bewerteModul('hoeren', versuch.antworten.hoeren, schluessel.keys, stufe),
    [versuch, schluessel, stufe],
  );

  const gemacht = [
    versuch.module.includes('lesen') ? lesen : null,
    versuch.module.includes('hoeren') ? hoeren : null,
  ].filter((m): m is ModulErgebnis => m !== null);

  const schwach = useMemo(() => schwachstellen(gemacht), [gemacht]);

  function ankiHerunterladen() {
    const tsv = ankiTsv(
      schluessel.glossar,
      schluessel.redewendungen,
      `GermanExamTrainer::${pruefung.meta.stufe}::${pruefung.meta.id}`,
    );
    herunterladen(
      new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' }),
      `anki_${pruefung.meta.id}.txt`,
    );
  }

  return (
    <div className="ergebnis">
      <nav className="tabs" role="tablist">
        {(
          [
            ['uebersicht', 'Ergebnis'],
            ['loesungen', 'Lösungen'],
            ['glossar', 'Wortschatz'],
            ['grammatik', 'Grammatik'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`knopf knopf--tab ${tab === id ? 'knopf--aktiv' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'uebersicht' && (
        <section>
          <div className="karten">
            {gemacht.map((m) => (
              <article
                key={m.modul}
                className={`karte karte--${
                  m.bestanden === null ? 'offen' : m.bestanden ? 'bestanden' : 'gefallen'
                }`}
              >
                <h3>{m.modul === 'lesen' ? 'Lesen' : 'Hören'}</h3>
                <p className="karte__punkte">
                  {m.punkte}
                  <span className="karte__max">/{m.maximum}</span>
                </p>
                {m.note !== null && <p className="karte__note">{m.note}</p>}
                <p className="karte__roh">
                  {m.richtig} von {m.gesamt} Aufgaben richtig
                </p>
                <ul className="karte__teile">
                  {m.proTeil.map((t) => (
                    <li key={t.teil}>
                      Teil {t.teil}: {t.richtig}/{t.gesamt}
                    </li>
                  ))}
                </ul>
              </article>
            ))}

            {(versuch.module.includes('schreiben') ||
              versuch.module.includes('sprechen')) && (
              <article className="karte karte--offen">
                <h3>Schreiben &amp; Sprechen</h3>
                <p className="karte__note">korrigieren Sie selbst</p>
                <p className="karte__roh">
                  Musterlösungen und Redemittel stehen unten — vergleichen Sie Ihren Text
                  und das, was Sie gesagt haben, damit.
                </p>
              </article>
            )}
          </div>

          {stufe === 'A2' && (
            <p className="notiz gesamtregel">
              <strong>A2 ist eine Prüfung, keine vier.</strong> Jeder Teil bringt
              höchstens 25 Punkte, und bestanden ist erst, wer <strong>60 von 100</strong>{' '}
              Punkten insgesamt erreicht, davon mindestens 45 von 75 in Lesen, Hören und
              Schreiben zusammen und mindestens 15 von 25 im Sprechen. Deshalb steht hier
              kein „bestanden“ pro Teil: Das Ergebnis steht erst fest, wenn auch Schreiben
              und Sprechen bewertet sind.
            </p>
          )}

          {schwach.length > 0 && (
            <section className="schwachstellen">
              <h3>Woran Sie als Nächstes arbeiten sollten</h3>
              {schwach.slice(0, 3).map((s) => (
                <article key={s.kompetenz} className="schwachstelle">
                  <h4>
                    {KOMPETENZ_NAME[s.kompetenz] ?? s.kompetenz} — {s.verloren} von{' '}
                    {s.gesamt} falsch
                  </h4>
                  <p>
                    {KOMPETENZ_RAT[s.kompetenz] ??
                      'Sehen Sie sich diese Aufgaben noch einmal an.'}
                  </p>
                </article>
              ))}
            </section>
          )}

          <Druckbogen
            examId={pruefung.meta.id}
            dateien={loesungsPdfs}
            titel="Zum Nachschlagen auf Papier"
            hinweis={
              'Das Lösungsheft zu dieser Prüfung: alle Lösungen mit Begründung, ' +
              'die vollständigen Hörtexte, Musterantworten, Glossar und Grammatik.'
            }
          />

          <div className="aktionen">
            <button type="button" className="knopf" onClick={ankiHerunterladen}>
              ⬇ Anki-Deck ({schluessel.glossar.length} Karten)
            </button>
            <button type="button" className="knopf knopf--sekundaer" onClick={onNeustart}>
              Zurück zur Übersicht
            </button>
          </div>
        </section>
      )}

      {tab === 'loesungen' && (
        <section className="loesungen">
          {gemacht.map((m) => (
            <div key={m.modul}>
              <h3>{m.modul === 'lesen' ? 'Lesen' : 'Hören'}</h3>
              {m.items.map((item) => {
                const info = schluessel.keys[`${m.modul}-${item.nr}`];
                return (
                  <article
                    key={item.nr}
                    className={`loesung ${item.korrekt ? 'loesung--richtig' : 'loesung--falsch'}`}
                  >
                    <header>
                      <span className="loesung__nr">{item.nr}</span>
                      <span className="loesung__status">
                        {item.korrekt ? '✓ richtig' : '✗ falsch'}
                      </span>
                      <span className="loesung__antwort">
                        Ihre Antwort: <strong>{item.gegeben ?? '—'}</strong>
                        {!item.korrekt && (
                          <>
                            {' '}
                            · Richtig: <strong>{item.richtig}</strong>
                          </>
                        )}
                      </span>
                    </header>
                    {info?.beleg && <p className="loesung__beleg">„{info.beleg}“</p>}
                    {info && <p className="loesung__de">{info.begruendung.de}</p>}
                    {info && <p className="loesung__en">{info.begruendung.en}</p>}
                  </article>
                );
              })}
            </div>
          ))}

          <details className="transkripte">
            <summary>Hörtexte — vollständige Transkription</summary>
            {schluessel.transkripte.map((t) => (
              <div key={t.teil}>
                <h4>
                  Teil {t.teil} ({t.wiederholungen}× zu hören)
                </h4>
                {t.zeilen.map((z, i) => (
                  <p key={i} className={z.betont ? 'zeile zeile--betont' : 'zeile'}>
                    <span className="zeile__rolle">{z.rolle}</span>
                    {z.text}
                  </p>
                ))}
              </div>
            ))}
          </details>

          <details className="transkripte">
            <summary>Musterlösungen Schreiben und Sprechen</summary>
            {schluessel.schreiben.map((a) => (
              <div key={a.nummer}>
                <h4>Schreiben — Aufgabe {a.nummer}</h4>
                {a.redemittel.length > 0 && (
                  <ul className="leitpunkte">
                    {a.redemittel.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {a.formular.length > 0 && (
                  <table className="formular__loesung">
                    <thead>
                      <tr>
                        <th>Feld</th>
                        <th>Richtig</th>
                        <th>Warum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.formular.map((f) => (
                        <tr key={f.feld}>
                          <td>{f.feld}</td>
                          <td>
                            <strong>{f.loesung}</strong>
                          </td>
                          <td>{f.begruendung}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {a.musterloesungen.map((m) => (
                  <article key={m.niveau} className="muster">
                    <h5>Musterlösung — {m.niveau}</h5>
                    <pre>{m.text}</pre>
                    <p className="muster__kommentar">{m.kommentar}</p>
                  </article>
                ))}
              </div>
            ))}
            {schluessel.sprechen.flatMap((t) =>
              t.themen.map((th) => (
                <article key={th.titel} className="muster">
                  <h5>Sprechen — {th.titel}</h5>
                  <pre>{th.musterantwort}</pre>
                </article>
              )),
            )}
          </details>
        </section>
      )}

      {tab === 'glossar' && (
        <section className="glossar">
          <p className="notiz">
            Alle Wörter stammen aus dieser Prüfung. Nomen mit Artikel und Plural, Verben
            mit allen Stammformen und der Präposition, die sie regieren.
          </p>
          <button type="button" className="knopf" onClick={ankiHerunterladen}>
            ⬇ Als Anki-Deck exportieren
          </button>

          <table className="glossartabelle">
            <thead>
              <tr>
                <th>Wort und Formen</th>
                <th>Bedeutung</th>
                <th>Im Text</th>
              </tr>
            </thead>
            <tbody>
              {[...schluessel.glossar]
                .sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
                .map((g) => (
                  <tr key={g.lemma}>
                    <td>
                      <strong>
                        {g.artikel && !g.lemma.startsWith(g.artikel)
                          ? `${g.artikel} ${g.lemma}`
                          : g.lemma}
                      </strong>
                      {g.plural && <span className="form">Plural: {g.plural}</span>}
                      {g.stammformen && (
                        <span className="form">
                          {g.stammformen.praesens_3sg} · {g.stammformen.praeteritum} ·{' '}
                          {g.stammformen.perfekt}
                          {g.stammformen.unregelmaessig && ' (unregelmäßig)'}
                          {g.trennbar && ' (trennbar)'}
                        </span>
                      )}
                      {g.praeposition && (
                        <span className="form form--praep">
                          + {g.praeposition.wort} + {g.praeposition.kasus}
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{g.bedeutung_en}</strong>
                      {g.bedeutung_de && <span className="form">{g.bedeutung_de}</span>}
                    </td>
                    <td>
                      <em>{g.beispiel}</em>
                      <span className="form">{g.fundstelle}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {schluessel.redewendungen.length > 0 && (
            <>
              <h3>Redewendungen und feste Wendungen</h3>
              <table className="glossartabelle">
                <tbody>
                  {schluessel.redewendungen.map((r) => (
                    <tr key={r.wendung}>
                      <td>
                        <strong>{r.wendung}</strong>
                      </td>
                      <td>
                        <strong>{r.bedeutung_en}</strong>
                        <span className="form">{r.bedeutung_de}</span>
                      </td>
                      <td>
                        <em>{r.beispiel}</em>
                        <span className="form">{r.fundstelle}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {tab === 'grammatik' && (
        <section className="grammatik">
          {schluessel.grammatik.map((g) => (
            <article className="grammatikpunkt" key={g.phaenomen}>
              <header className="teil__kopf">
                <h3>{g.phaenomen}</h3>
                <span className="teil__meta">{g.fundstelle}</span>
              </header>
              <p>{g.erklaerung_de}</p>
              <p className="loesung__en">{g.erklaerung_en}</p>
              <blockquote className="beleg">„{g.belegSatz}“</blockquote>
              <ol className="uebungen">
                {g.uebungen.map((u, i) => (
                  <li key={i}>
                    <p>{u.aufgabe}</p>
                    {u.hinweis && <p className="notiz">Tipp: {u.hinweis}</p>}
                    <details>
                      <summary>Lösung anzeigen</summary>
                      <p className="loesung__de">{u.loesung}</p>
                    </details>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
