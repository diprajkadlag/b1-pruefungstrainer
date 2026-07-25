import { useState } from 'react';
import type { AudioManifest, OeffentlichePruefung } from '@b1/core';
import { audioUrl } from '../lib/content';
import { Rekorder } from '../components/Rekorder';
import { formatiereZeit, useCountdown } from '../components/Timer';

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
      <section className="teil">
        <header className="teil__kopf">
          <h2>Vorbereitung</h2>
          <span className="teil__meta">{pruefung.sprechen.vorbereitungMinuten} Minuten</span>
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
                <div className="folien">
                  {teil.themen[gewaehltesThema]?.folien.map((f, i) => (
                    <article className="folie" key={i}>
                      <span className="folie__nr">Folie {i + 1}</span>
                      <p>{f.replace(/^Folie\s*\d+\s*[—–-]\s*/, '')}</p>
                    </article>
                  ))}
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
