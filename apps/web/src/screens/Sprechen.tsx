import { useState } from 'react';
import { STUFEN, type AudioManifest, type OeffentlichePruefung } from '@pruefung/core';
import { audioUrl } from '../lib/content';
import { Rekorder } from '../components/Rekorder';
import { formatiereZeit, useCountdown } from '../components/Timer';

/**
 * The label on one outline card.
 *
 * B1 prints numbered slides. B2 asks for a talk with an introduction, a main
 * part and a conclusion, and each point names its own role — so the label is
 * taken from the text where there is one, and falls back to the slide number.
 */
function gliederungLabel(punkt: string, index: number): [string, string] {
  const treffer = /^([^—–-]{3,24})\s*[—–-]\s*(.+)$/s.exec(punkt);
  const marke = treffer?.[1]?.trim();
  const rest = treffer?.[2]?.trim();
  if (marke && rest && !/^Folie\s*\d+$/i.test(marke)) {
    return [marke, rest];
  }
  return [`Folie ${index + 1}`, punkt.replace(/^Folie\s*\d+\s*[—–-]\s*/, '')];
}

interface Props {
  pruefung: OeffentlichePruefung;
  manifest: AudioManifest | null;
  aufnahmen: Record<string, Blob>;
  onAufnahme: (teil: number, blob: Blob) => void;
}

export function Sprechen({ pruefung, manifest, aufnahmen, onAufnahme }: Props) {
  const [vorbereitungBis, setVorbereitungBis] = useState<number | null>(null);
  const rest = useCountdown(vorbereitungBis, () => undefined);
  const [gewaehltesThema, setGewaehltesThema] = useState(0);

  return (
    <div className="modul">
      {/* A2 gives no preparation time at all — the cards are handed out during
          the test — so it gets an honest note instead of a zero-minute timer. */}
      {pruefung.sprechen.vorbereitungMinuten === 0 ? (
        <section className="teil">
          <header className="teil__kopf">
            <h2>Vorbereitung</h2>
            <span className="teil__meta">keine</span>
          </header>
          <p className="teil__anweisung">
            In dieser Prüfung gibt es keine Vorbereitungszeit. Sie bekommen die Karten
            erst im Prüfungsraum und sehen sie etwa zwanzig Sekunden an. Üben Sie hier
            also so, wie Sie dort sprechen müssen: sofort und ohne Notizen.
          </p>
        </section>
      ) : (
        <section className="teil">
          <header className="teil__kopf">
            <h2>Vorbereitung</h2>
            <span className="teil__meta">
              {pruefung.sprechen.vorbereitungMinuten} Minuten
            </span>
          </header>
          <p className="teil__anweisung">
            Lesen Sie zuerst alle Aufgaben und machen Sie sich Stichworte. Ganze Sätze
            aufzuschreiben und später abzulesen kostet in der Prüfung Punkte.
          </p>
          {vorbereitungBis === null ? (
            <button
              type="button"
              className="knopf knopf--gross"
              onClick={() =>
                setVorbereitungBis(
                  Date.now() + pruefung.sprechen.vorbereitungMinuten * 60_000,
                )
              }
            >
              Vorbereitungszeit starten
            </button>
          ) : (
            <p className="vorbereitung">
              Verbleibend: <strong>{formatiereZeit(rest)}</strong>
            </p>
          )}
        </section>
      )}

      {pruefung.sprechen.teile.map((teil) => {
        const partner = manifest?.sprechen.filter((s) => s.teil === teil.nummer) ?? [];
        const aufnahme = aufnahmen[String(teil.nummer)];

        return (
          <section className="teil" key={teil.nummer}>
            <header className="teil__kopf">
              <h2>
                Teil {teil.nummer} — {teil.titel}
              </h2>
              <span className="teil__meta">
                ca. {teil.dauerMinuten} Min. · {teil.punkte} Punkte
              </span>
            </header>
            <p className="teil__anweisung">{teil.anweisung}</p>
            {teil.situation && <p className="situation">{teil.situation}</p>}

            {teil.karten && (
              <div className="karten">
                {teil.karten.map((k) => (
                  <span className="karte__stichwort" key={k}>
                    {k}
                  </span>
                ))}
                <p className="notiz">
                  Bilden Sie zu jedem Stichwort eine <strong>ganze Frage</strong>. Ein
                  einzelnes Wort ist keine Frage und bringt keine Punkte.
                </p>
              </div>
            )}

            {teil.planungspunkte && (
              <ul className="leitpunkte">
                {teil.planungspunkte.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            {teil.themen && (
              <div className="themenwahl">
                <div className="themenwahl__knoepfe" role="tablist">
                  {teil.themen.map((t, i) => (
                    <button
                      key={t.titel}
                      type="button"
                      role="tab"
                      aria-selected={gewaehltesThema === i}
                      className={`knopf knopf--tab ${gewaehltesThema === i ? 'knopf--aktiv' : ''}`}
                      onClick={() => setGewaehltesThema(i)}
                    >
                      Thema {i + 1}
                    </button>
                  ))}
                </div>
                <h3 className="thema__titel">{teil.themen[gewaehltesThema]?.titel}</h3>
                <p className="notiz">{STUFEN[pruefung.meta.stufe].gliederungTitel}</p>
                <div className="folien">
                  {teil.themen[gewaehltesThema]?.folien.map((f, i) => {
                    const [label, text] = gliederungLabel(f, i);
                    return (
                      <article className="folie" key={i}>
                        <span className="folie__nr">{label}</span>
                        <p>{text}</p>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {teil.fragen && (
              <ul className="leitpunkte">
                {teil.fragen.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}

            {partner.length > 0 && (
              <div className="partner">
                <h3>Simulierter Partner</h3>
                <p className="notiz">
                  Sie legen die Prüfung allein ab. Spielen Sie den Beitrag ab und
                  antworten Sie danach — die Aufnahme läuft weiter.
                </p>
                <ol className="partner__liste">
                  {partner.map((p) => (
                    <li key={p.index}>
                      <audio controls src={audioUrl(pruefung.meta.id, p.datei)} />
                      {p.hinweis && <p className="partner__hinweis">{p.hinweis}</p>}
                      <span className="notiz">ca. {p.wartenSek} Sekunden antworten</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <Rekorder
              maxSekunden={Math.round(teil.dauerMinuten * 60)}
              vorhanden={aufnahme}
              onFertig={(blob) => onAufnahme(teil.nummer, blob)}
            />
          </section>
        );
      })}
    </div>
  );
}
