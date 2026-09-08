import type { Lernhilfe } from '@pruefung/core';
import { fortschrittLesen } from '../lib/fortschritt';

/**
 * The games shelf for one level.
 *
 * Two games over the same cards. Sprachschatz asks and you tap; Wortsprung
 * asks and you run and jump. They share the Leitner boxes and the history,
 * so a word missed in one comes back sooner in the other — the point is the
 * vocabulary, not the game, and a learner should be able to switch between
 * the two without the schedule noticing.
 */
interface Props {
  lernhilfe: Lernhilfe;
  onSprachschatz: () => void;
  onWortsprung: () => void;
  onZurueck: () => void;
}

export function Spiele({ lernhilfe, onSprachschatz, onWortsprung, onZurueck }: Props) {
  const stufe = lernhilfe.stufe;
  const rekord = fortschrittLesen(stufe, 'gemischt');
  return (
    <div className="spiele">
      <header className="ws__kopf">
        <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
          ← Zurück
        </button>
        <h2>Spiele {stufe}</h2>
      </header>
      <p className="notiz">
        Dieselben Redemittel, Grammatiktabellen und Wörter wie im Spickzettel — aber
        gefragt statt nachgeschlagen. Beide Spiele merken sich gemeinsam, was Sie schon
        können: Was in einem danebengeht, kommt im anderen zuerst zurück.
      </p>

      <div className="spiele__karten">
        <button type="button" className="spielkarte" onClick={onSprachschatz}>
          <span className="spielkarte__zeichen" aria-hidden="true">
            ✨
          </span>
          <span className="spielkarte__text">
            <strong>Sprachschatz</strong>
            <span className="notiz">
              Zwölf Karten, drei Leben, tippen. Elf Fragearten, jede Antwort mit
              Begründung — und ein Verlauf, in dem jede Karte wieder auffindbar ist.
            </span>
            {rekord.gespielt > 0 && (
              <span className="spielkarte__rekord">
                Rekord {rekord.bestePunkte} · {rekord.gespielt} Runden
              </span>
            )}
          </span>
        </button>

        <button type="button" className="spielkarte" onClick={onWortsprung}>
          <span className="spielkarte__zeichen" aria-hidden="true">
            🏃
          </span>
          <span className="spielkarte__text">
            <strong>Wortsprung</strong>
            <span className="notiz">
              Dieselben Karten, aber die Antwort wird gesprungen: Kopf gegen die richtige
              Kiste, Sprung auf die richtige Ente. Die richtige klingelt, die falsche
              kostet ein Herz.
            </span>
            <span className="spielkarte__neu">Neu</span>
          </span>
        </button>
      </div>
    </div>
  );
}
