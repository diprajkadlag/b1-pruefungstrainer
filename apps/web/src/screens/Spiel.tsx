import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KATEGORIEN,
  LEBEN,
  alleFragen,
  antworten,
  istRichtig,
  kategorieTitel,
  leererStand,
  naechsteBox,
  punkteFuer,
  rundeBauen,
  urteil,
  type Frage,
  type Kategorie,
  type Lernhilfe,
  type Stand,
} from '@pruefung/core';
import { Szene } from '../components/Szene';
import { fortschrittLesen, fortschrittSchreiben } from '../lib/fortschritt';

/**
 * Sprachschatz — the learning game.
 *
 * The engine in `@pruefung/core` decides what is asked and what is right. This
 * file is everything the learner actually feels: the colour an article carries,
 * the card arriving, the counter climbing, the shake when it goes wrong.
 *
 * That is not decoration either. A round has to be worth coming back to, or
 * the best question generator in the world gets used once. What is here is
 * chosen for that: immediate feedback so a correction lands while the attempt
 * is still warm, a streak so a good run feels like something, three lives so
 * there is a little tension, and a reason shown after every single answer —
 * right or wrong — because being told only "correct" teaches nothing either.
 */

interface Props {
  lernhilfe: Lernhilfe;
  onZurueck: () => void;
}

type Phase = 'wahl' | 'spiel' | 'ende';

/**
 * How long the answer stays on screen before the next card, in ms.
 *
 * The first version gave a correct answer 900 ms, which is long enough to see
 * that you were right and nowhere near long enough to read *why* — so the
 * explanation, which is the part that does the teaching, was gone before it
 * could be read. Both pauses are two seconds longer than that.
 */
const PAUSE_RICHTIG = 2900;
const PAUSE_FALSCH = 4600;

/**
 * The seed for the next round. `?saat=123` pins it, so a round can be replayed
 * card for card — worth having when someone reports that a question was
 * wrong, and what lets the end-to-end test play a full round without the
 * answers being written into the page for it to read.
 */
function saatWaehlen(): number {
  const gewuenscht = Number(new URLSearchParams(window.location.search).get('saat'));
  return Number.isFinite(gewuenscht) && gewuenscht > 0 ? gewuenscht : Date.now();
}

const KATEGORIE_TEXT: Record<Kategorie, string> = {
  wortschatz: 'Artikel, Plural, Bedeutung, Gegenteil und Verbformen.',
  grammatik: 'Lücken in den Tabellen und die Regel hinter dem Beispiel.',
  redemittel: 'Wofür ein Satz da ist, welches Wort fehlt, und die Wortstellung.',
  gemischt: 'Alles durcheinander — so bleibt es am längsten im Kopf.',
};

const KATEGORIE_ZEICHEN: Record<Kategorie, string> = {
  wortschatz: '💎',
  grammatik: '🧩',
  redemittel: '🗣️',
  gemischt: '🎲',
};

export function Spiel({ lernhilfe, onZurueck }: Props) {
  const stufe = lernhilfe.stufe;
  const [phase, setPhase] = useState<Phase>('wahl');
  const [kategorie, setKategorie] = useState<Kategorie>('gemischt');
  const [runde, setRunde] = useState<Frage[]>([]);
  const [nr, setNr] = useState(0);
  const [stand, setStand] = useState<Stand>(leererStand());
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [gebaut, setGebaut] = useState<string[]>([]);
  const [zuletzt, setZuletzt] = useState<number | null>(null);

  // Every pending "next card" timer, so leaving mid-round cannot fire a state
  // update into an unmounted screen.
  const uhren = useRef<number[]>([]);
  useEffect(() => () => uhren.current.forEach(window.clearTimeout), []);

  const frage = runde[nr];
  const beantwortet = gewaehlt !== null;

  // Building the pool walks every noun, verb and table at the level, so it is
  // kept off the render path and rebuilt only when the level or category
  // actually changes.
  const pool = useMemo(
    () => alleFragen(lernhilfe, kategorie, lernhilfe.titel.length),
    [lernhilfe, kategorie],
  );

  function rundeStarten(k: Kategorie) {
    const fortschritt = fortschrittLesen(stufe, k);
    const fragen = rundeBauen(
      alleFragen(lernhilfe, k, lernhilfe.titel.length),
      fortschritt,
      saatWaehlen(),
    );
    uhren.current.forEach(window.clearTimeout);
    uhren.current = [];
    setKategorie(k);
    setRunde(fragen);
    setNr(0);
    setStand(leererStand());
    setGewaehlt(null);
    setGebaut([]);
    setZuletzt(null);
    setPhase('spiel');
  }

  function weiter(neuerStand: Stand, laenge: number) {
    if (neuerStand.leben <= 0 || nr + 1 >= laenge) {
      const f = fortschrittLesen(stufe, kategorie);
      fortschrittSchreiben(stufe, kategorie, {
        ...f,
        bestePunkte: Math.max(f.bestePunkte, neuerStand.punkte),
        besteSerie: Math.max(f.besteSerie, neuerStand.besteSerie),
        gespielt: f.gespielt + 1,
      });
      setPhase('ende');
      return;
    }
    setNr((n) => n + 1);
    setGewaehlt(null);
    setGebaut([]);
    setZuletzt(null);
  }

  function beantworten(antwort: string) {
    if (!frage || beantwortet) return;
    const richtig = istRichtig(frage, antwort);
    const neuerStand = antworten(stand, richtig);

    // The Leitner box moves the moment the answer is given, not at the end of
    // the round: a round abandoned halfway should still have taught the
    // schedule something.
    const f = fortschrittLesen(stufe, kategorie);
    fortschrittSchreiben(stufe, kategorie, {
      ...f,
      boxen: { ...f.boxen, [frage.id]: naechsteBox(f.boxen[frage.id] ?? 0, richtig) },
    });

    setGewaehlt(antwort);
    setStand(neuerStand);
    setZuletzt(richtig ? punkteFuer(neuerStand.serie) : null);
    uhren.current.push(
      window.setTimeout(
        () => weiter(neuerStand, runde.length),
        richtig ? PAUSE_RICHTIG : PAUSE_FALSCH,
      ),
    );
  }

  // --- the picker -----------------------------------------------------------

  if (phase === 'wahl') {
    const alle: Kategorie[] = [...KATEGORIEN, 'gemischt'];
    return (
      <div className="spiel spiel--wahl">
        <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
          ← Zurück
        </button>

        <h1 className="spiel__titel">
          Sprachschatz <span className="spiel__stufe">{stufe}</span>
        </h1>
        <p className="spiel__lead">
          Zwölf Karten pro Runde, drei Leben. Was danebengeht, kommt in der nächsten Runde
          zuerst zurück — und alles kommt aus dem Spickzettel {stufe}.
        </p>

        <div className="kacheln">
          {alle.map((k) => {
            const anzahl = alleFragen(lernhilfe, k, 1).length;
            const f = fortschrittLesen(stufe, k);
            return (
              <button
                type="button"
                key={k}
                className={`kachel kachel--${k}`}
                onClick={() => rundeStarten(k)}
                disabled={anzahl < 1}
              >
                <span className="kachel__zeichen" aria-hidden="true">
                  {KATEGORIE_ZEICHEN[k]}
                </span>
                <span className="kachel__name">{kategorieTitel(k)}</span>
                <span className="kachel__text">{KATEGORIE_TEXT[k]}</span>
                <span className="kachel__fuss">
                  {anzahl} Karten
                  {f.gespielt > 0 && ` · Bestwert ${f.bestePunkte}`}
                </span>
              </button>
            );
          })}
        </div>

        <p className="notiz spiel__farbnotiz">
          Nomen tragen im ganzen Spiel dieselbe Farbe wie ihr Artikel:{' '}
          <b className="artikel artikel--der">der</b>{' '}
          <b className="artikel artikel--die">die</b>{' '}
          <b className="artikel artikel--das">das</b>. Das Geschlecht folgt keiner Regel,
          die man lernen könnte — also bekommt es einen zweiten Weg ins Gedächtnis.
        </p>
      </div>
    );
  }

  // --- the result -----------------------------------------------------------

  if (phase === 'ende') {
    const f = fortschrittLesen(stufe, kategorie);
    const { titel, text } = urteil(stand, runde.length);
    const gelernt = Object.values(f.boxen).filter((b) => b >= 4).length;
    return (
      <div className="spiel spiel--ende">
        <div
          className={`truhe ${stand.leben > 0 ? 'truhe--offen' : ''}`}
          aria-hidden="true"
        >
          {stand.leben > 0 ? '🏆' : '💤'}
        </div>
        <h1 className="spiel__titel">{titel}</h1>
        <p className="spiel__lead">{text}</p>

        <dl className="bilanz">
          <div>
            <dt>Punkte</dt>
            <dd>{stand.punkte}</dd>
          </div>
          <div>
            <dt>Beste Serie</dt>
            <dd>{stand.besteSerie}</dd>
          </div>
          <div>
            <dt>Richtig</dt>
            <dd>
              {stand.richtig} / {runde.length}
            </dd>
          </div>
          <div>
            <dt>Bestwert</dt>
            <dd>{f.bestePunkte}</dd>
          </div>
        </dl>

        <p className="notiz">
          {gelernt} von {pool.length} Karten sitzen inzwischen (
          {kategorieTitel(kategorie)}, {stufe}). Karten, die Sie sicher können, kommen
          immer seltener.
        </p>

        <div className="spiel__knoepfe">
          <button
            type="button"
            className="knopf knopf--gross knopf--primaer"
            onClick={() => rundeStarten(kategorie)}
          >
            Noch eine Runde
          </button>
          <button type="button" className="knopf" onClick={() => setPhase('wahl')}>
            Andere Kategorie
          </button>
          <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
            Zum Start
          </button>
        </div>
      </div>
    );
  }

  if (!frage) return null;

  // --- playing --------------------------------------------------------------

  const richtigBeantwortet = beantwortet && istRichtig(frage, gewaehlt);

  return (
    <div className="spiel">
      <div className="spiel__leiste">
        <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
          ← Zurück
        </button>
        <div className="leben" role="status" aria-label={`${stand.leben} Leben übrig`}>
          {Array.from({ length: LEBEN }, (_, i) => (
            <span key={i} className={`herz ${i < stand.leben ? '' : 'herz--weg'}`}>
              ♥
            </span>
          ))}
        </div>
        <div className="punktestand">
          <span className="punktestand__zahl">{stand.punkte}</span>
          {stand.serie >= 2 && (
            <span className="serie" title={`${stand.serie} in Folge`}>
              🔥 {stand.serie}
            </span>
          )}
        </div>
      </div>

      {/* The path. Twelve stations, so the end of the round is always in
          sight — an open-ended drill is much easier to abandon. */}
      <ol className="pfad" aria-label={`Karte ${nr + 1} von ${runde.length}`}>
        {runde.map((_, i) => (
          <li
            key={i}
            className={`pfad__halt ${i < nr ? 'pfad__halt--fertig' : ''} ${
              i === nr ? 'pfad__halt--jetzt' : ''
            }`}
          />
        ))}
      </ol>

      <article
        className={`karte-spiel ${
          beantwortet
            ? richtigBeantwortet
              ? 'karte-spiel--gut'
              : 'karte-spiel--schlecht'
            : ''
        }`}
        key={frage.id}
      >
        <header className="karte-spiel__kopf">
          <Szene name={frage.szene} />
          <div>
            <p className="karte-spiel__hinweis">{frage.hinweis}</p>
            <h2 className="karte-spiel__frage">{frage.frage}</h2>
          </div>
        </header>

        {frage.vorlage && <p className="vorlage">{frage.vorlage}</p>}

        {frage.art === 'bauen' ? (
          <Bauen
            frage={frage}
            gebaut={gebaut}
            setGebaut={setGebaut}
            beantwortet={beantwortet}
            onFertig={beantworten}
          />
        ) : (
          <div
            className={`optionen ${frage.art === 'artikel' ? 'optionen--artikel' : ''}`}
          >
            {frage.optionen.map((o) => {
              const istLoesung = o === frage.loesung;
              const istGewaehlt = o === gewaehlt;
              return (
                <button
                  type="button"
                  key={o}
                  className={[
                    'option',
                    frage.art === 'artikel' ? `artikel artikel--${o}` : '',
                    beantwortet && istLoesung ? 'option--richtig' : '',
                    beantwortet && istGewaehlt && !istLoesung ? 'option--falsch' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={beantwortet}
                  onClick={() => beantworten(o)}
                >
                  {o}
                </button>
              );
            })}
          </div>
        )}

        {zuletzt !== null && (
          <span className="gutschrift" aria-hidden="true">
            +{zuletzt}
          </span>
        )}

        {beantwortet && (
          <div className="rueckmeldung" role="status">
            <strong>
              {richtigBeantwortet ? 'Richtig.' : `Richtig wäre: ${frage.loesung}`}
            </strong>
            <span>{frage.erklaerung}</span>
          </div>
        )}
      </article>
    </div>
  );
}

/**
 * The word-order task: chips, tapped into place.
 *
 * The only question in the game that asks the learner to produce rather than
 * choose, which is also the harder and more durable thing to practise — and
 * German word order is not something recognition drills ever fix.
 */
function Bauen({
  frage,
  gebaut,
  setGebaut,
  beantwortet,
  onFertig,
}: {
  frage: Frage;
  gebaut: string[];
  setGebaut: (w: string[]) => void;
  beantwortet: boolean;
  onFertig: (antwort: string) => void;
}) {
  // Chips carry their position, so two identical words would still be two
  // separate chips. The generator rejects repeats today; this keeps the
  // component correct if that ever changes.
  const wort = (chip: string) => chip.slice(chip.indexOf(':') + 1);
  const nochOffen = frage.optionen
    .map((w, i) => `${i}:${w}`)
    .filter((c) => !gebaut.includes(c));
  const text = (liste: string[]) => liste.map(wort).join(' ');

  return (
    <div className="bauen">
      <p className={`bauen__zeile ${gebaut.length ? '' : 'bauen__zeile--leer'}`}>
        {gebaut.length ? text(gebaut) : 'Tippen Sie die Wörter der Reihe nach an.'}
      </p>

      <div className="bauen__chips">
        {nochOffen.map((c) => (
          <button
            type="button"
            key={c}
            className="chip"
            disabled={beantwortet}
            onClick={() => setGebaut([...gebaut, c])}
          >
            {wort(c)}
          </button>
        ))}
      </div>

      <div className="bauen__knoepfe">
        <button
          type="button"
          className="knopf knopf--sekundaer"
          disabled={beantwortet || gebaut.length === 0}
          onClick={() => setGebaut(gebaut.slice(0, -1))}
        >
          Zurücknehmen
        </button>
        <button
          type="button"
          className="knopf knopf--primaer"
          disabled={beantwortet || nochOffen.length > 0}
          onClick={() => onFertig(text(gebaut))}
        >
          Fertig
        </button>
      </div>
    </div>
  );
}
