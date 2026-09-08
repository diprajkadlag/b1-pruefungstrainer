import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BODEN,
  ENTE,
  HELD,
  HOEHE,
  KATEGORIEN,
  KEINE_EINGABE,
  KISTE,
  KLANG_AUS,
  KLANG_MUENZE,
  KLANG_SPRUNG,
  KLANG_TREFFER,
  KLANG_ZIEL,
  LEBEN,
  LESEZEIT_PRO_WORT,
  PAUSE_GRUND_FALSCH,
  PAUSE_GRUND_RICHTIG,
  PAUSE_MAX,
  SCHRITT,
  alleFragen,
  anlaufX,
  antworten,
  entenBlick,
  entenX,
  heldAnfang,
  istRichtig,
  kameraX,
  leererStand,
  naechsteBox,
  punkteFuer,
  rundeBauen,
  schritt,
  stationBauen,
  type Antwortnotiz,
  type Eingabe,
  type Frage,
  type Held,
  type Kategorie,
  type Lernhilfe,
  type Stand,
  type Station,
  type Ziel,
} from '@pruefung/core';
import { klangAn, klangSetzen, klangSpielen } from '../lib/klang';
import {
  fortschrittLesen,
  fortschrittSchreiben,
  verlaufNotieren,
} from '../lib/fortschritt';

/**
 * Wortsprung — Sprachschatz, answered with the feet.
 *
 * The same twelve-card rounds, the same Leitner boxes, the same history, the
 * same scoring. What changes is the gesture: instead of tapping an option you
 * run under it and jump. A question-mark box is headed from below; a duck is
 * landed on. The right one rings like a coin and the hero runs on; the wrong
 * one costs a heart. Three hearts, twelve stations.
 *
 * The world is simulated in fixed slices from `@pruefung/core` and only drawn
 * here, so a phone that drops frames plays the same game as a desktop. The
 * option texts are DOM, not canvas: they wrap, they carry the article colours,
 * and a screen reader or a test can find them. Tapping one makes the hero run
 * there and jump — the assist for a thumb that has no D-pad — so the answer is
 * still given by the character, never by the tap alone.
 */

/**
 * Logical width of the view. On a wide screen the window onto the station is
 * 640 logical pixels scaled up; on a phone it narrows instead of shrinking, so
 * the hero stays thumb-sized and the camera simply scrolls more.
 */
const SICHT_MAX = 640;
const SICHT_MIN = 340;

const KATEGORIE_TEXT: Record<Kategorie, string> = {
  wortschatz: 'Wortschatz',
  grammatik: 'Grammatik',
  redemittel: 'Redemittel',
  gemischt: 'Alles gemischt',
};

/** Word-order questions ask for a sentence, not a choice; nothing to jump on. */
const SPRINGBAR = (f: Frage) => f.art !== 'bauen';

function saatWaehlen(): number {
  const gewuenscht = Number(new URLSearchParams(window.location.search).get('saat'));
  return Number.isFinite(gewuenscht) && gewuenscht > 0 ? gewuenscht : Date.now();
}

interface Effekt {
  art: 'muenze' | 'herz' | 'staub' | 'text';
  x: number;
  y: number;
  vx: number;
  vy: number;
  alter: number;
  dauer: number;
  text?: string;
}

/** Everything that moves, outside React so a frame never re-renders. */
interface Welt {
  station: Station;
  held: Held;
  t: number;
  acc: number;
  letzte: number;
  kamera: number;
  eingabe: Eingabe;
  verbraucht: Set<number>;
  /** Target index the assist is running to, if any. */
  auto: number | null;
  beantwortet: boolean;
  pausiert: boolean;
  effekte: Effekt[];
  /** Seconds since a box was headed / a duck stomped, for the animation. */
  gestossen: Map<number, number>;
  gestampft: Map<number, number>;
  verletzt: number;
  farbe: string;
  farbeWeich: string;
}

interface Urteil {
  ziel: Ziel;
  richtig: boolean;
}

interface Props {
  lernhilfe: Lernhilfe;
  onZurueck: () => void;
}

export function Wortsprung({ lernhilfe, onZurueck }: Props) {
  const stufe = lernhilfe.stufe;
  const [phase, setPhase] = useState<'wahl' | 'spiel' | 'ende'>('wahl');
  const [kategorie, setKategorie] = useState<Kategorie>('gemischt');
  const [fragen, setFragen] = useState<Frage[]>([]);
  const [nr, setNr] = useState(0);
  const [stand, setStand] = useState<Stand>(leererStand());
  const [urteil, setUrteil] = useState<Urteil | null>(null);
  const [ton, setTon] = useState(klangAn());
  const [verlauf, setVerlauf] = useState<
    { frage: Frage; antwort: string; richtig: boolean }[]
  >([]);
  const [skala, setSkala] = useState(1);
  const [sicht, setSicht] = useState(SICHT_MAX);

  const welt = useRef<Welt | null>(null);
  const standRef = useRef(stand);
  const buehne = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const etiketten = useRef(new Map<number, HTMLButtonElement>());
  const uhr = useRef<number>();
  const raf = useRef<number>();
  const fragenRef = useRef(fragen);
  const nrRef = useRef(nr);
  fragenRef.current = fragen;
  nrRef.current = nr;
  standRef.current = stand;

  const frage = fragen[nr];

  // --- building a round ---------------------------------------------------------

  /**
   * The level's colours as the stage prints them. Read from the stage, not
   * the page: the stage keeps its daylight palette when the page goes dark,
   * and the hero and the hills are drawn in the stage's ink, not the page's.
   * Before the stage exists the page has to do, and the size effect below
   * corrects it the moment the stage mounts.
   */
  function farben(el: Element | null = buehne.current) {
    const stil = getComputedStyle(el ?? document.documentElement);
    return {
      farbe: stil.getPropertyValue('--stufe').trim() || '#2f3e4e',
      farbeWeich: stil.getPropertyValue('--stufe-weich').trim() || '#f4f6f8',
    };
  }

  function weltBauen(f: Frage, stationNr: number): Welt {
    const station = stationBauen(f, stationNr);
    const { farbe, farbeWeich } = farben();
    return {
      station,
      held: heldAnfang(station),
      t: 0,
      acc: 0,
      letzte: performance.now(),
      kamera: 0,
      eingabe: { ...KEINE_EINGABE },
      verbraucht: new Set(),
      auto: null,
      beantwortet: false,
      pausiert: false,
      effekte: [],
      gestossen: new Map(),
      gestampft: new Map(),
      verletzt: 0,
      farbe,
      farbeWeich,
    };
  }

  function starten(k: Kategorie) {
    const pool = alleFragen(lernhilfe, k, lernhilfe.titel.length).filter(SPRINGBAR);
    const runde = rundeBauen(pool, fortschrittLesen(stufe, k), saatWaehlen());
    setKategorie(k);
    setFragen(runde);
    setNr(0);
    setStand(leererStand());
    setVerlauf([]);
    setUrteil(null);
    etiketten.current.clear();
    welt.current = runde[0] ? weltBauen(runde[0], 0) : null;
    setPhase(runde.length > 0 ? 'spiel' : 'wahl');
  }

  // --- answering ------------------------------------------------------------------

  const weiter = useCallback(() => {
    window.clearTimeout(uhr.current);
    const w = welt.current;
    const alle = fragenRef.current;
    const jetzt = nrRef.current;
    const s = standRef.current;
    if (!w) return;
    if (s.leben <= 0 || jetzt + 1 >= alle.length) {
      const f = fortschrittLesen(stufe, kategorie);
      fortschrittSchreiben(stufe, kategorie, {
        ...f,
        bestePunkte: Math.max(f.bestePunkte, s.punkte),
        besteSerie: Math.max(f.besteSerie, s.besteSerie),
        gespielt: f.gespielt + 1,
      });
      klangSpielen(s.leben <= 0 ? KLANG_AUS : KLANG_ZIEL);
      setUrteil(null);
      setPhase('ende');
      return;
    }
    const naechste = alle[jetzt + 1]!;
    etiketten.current.clear();
    welt.current = weltBauen(naechste, jetzt + 1);
    setNr(jetzt + 1);
    setUrteil(null);
  }, [stufe, kategorie]);

  function beantworten(ziel: Ziel) {
    const w = welt.current;
    if (!w || w.beantwortet) return;
    w.beantwortet = true;
    w.auto = null;
    w.verbraucht.add(ziel.index);

    const f = w.station.frage;
    const richtig = istRichtig(f, ziel.text);
    const neu = antworten(standRef.current, richtig);
    standRef.current = neu;
    setStand(neu);

    // The Leitner box moves the moment the answer is given, not at the end of
    // the round — the same rule as Sprachschatz, on the same store.
    const fs = fortschrittLesen(stufe, kategorie);
    fortschrittSchreiben(stufe, kategorie, {
      ...fs,
      boxen: { ...fs.boxen, [f.id]: naechsteBox(fs.boxen[f.id] ?? 0, richtig) },
    });
    const notiz: Antwortnotiz = {
      id: f.id,
      kategorie: f.kategorie,
      antwort: ziel.text,
      richtig,
      zeit: Date.now(),
    };
    verlaufNotieren(stufe, notiz);
    setVerlauf((v) => [...v, { frage: f, antwort: ziel.text, richtig }]);

    const zx =
      ziel.art === 'kiste'
        ? ziel.x + KISTE.breite / 2
        : entenX(ziel, w.t) + ENTE.breite / 2;
    const zy = ziel.art === 'kiste' ? ziel.y : ziel.y - 6;
    if (richtig) {
      klangSpielen(KLANG_MUENZE);
      for (let i = 0; i < 6; i++) {
        w.effekte.push({
          art: 'muenze',
          x: zx,
          y: zy,
          vx: (i - 2.5) * 55,
          vy: -260 - Math.abs(i - 2.5) * 30,
          alter: 0,
          dauer: 0.9,
        });
      }
      w.effekte.push({
        art: 'text',
        x: zx,
        y: zy - 20,
        vx: 0,
        vy: -50,
        alter: 0,
        dauer: 1.1,
        text: `+${punkteFuer(neu.serie)}`,
      });
    } else {
      klangSpielen(KLANG_TREFFER);
      w.verletzt = 1.1;
      for (let i = 0; i < 4; i++) {
        w.effekte.push({
          art: 'herz',
          x: w.held.x + HELD.breite / 2,
          y: w.held.y,
          vx: (i - 1.5) * 70,
          vy: -200,
          alter: 0,
          dauer: 0.9,
        });
      }
    }

    // Let the pop play out before the card comes up, then hold the card for
    // as long as the explanation takes to read — capped, with Weiter always
    // there for anyone faster.
    const woerter = f.erklaerung.split(/\s+/).length;
    const pause = Math.min(
      PAUSE_MAX,
      (richtig ? PAUSE_GRUND_RICHTIG : PAUSE_GRUND_FALSCH) + woerter * LESEZEIT_PRO_WORT,
    );
    window.setTimeout(() => {
      if (welt.current !== w) return;
      w.pausiert = true;
      setUrteil({ ziel, richtig });
      uhr.current = window.setTimeout(weiter, pause);
    }, 650);
  }

  // --- input ------------------------------------------------------------------------

  function druecken(taste: keyof Eingabe, an: boolean) {
    const w = welt.current;
    if (!w) return;
    if (an) w.auto = null;
    w.eingabe[taste] = an;
  }

  useEffect(() => {
    if (phase !== 'spiel') return;
    const runter = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
          druecken('links', true);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
          druecken('rechts', true);
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'w':
        case ' ':
          if (welt.current?.pausiert) weiter();
          else druecken('springen', true);
          e.preventDefault();
          break;
        case 'Enter':
          if (welt.current?.pausiert) weiter();
          break;
      }
    };
    const hoch = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
          druecken('links', false);
          break;
        case 'ArrowRight':
        case 'd':
          druecken('rechts', false);
          break;
      }
    };
    window.addEventListener('keydown', runter);
    window.addEventListener('keyup', hoch);
    return () => {
      window.removeEventListener('keydown', runter);
      window.removeEventListener('keyup', hoch);
    };
  }, [phase, weiter]);

  // --- size -----------------------------------------------------------------------------

  useEffect(() => {
    const el = buehne.current;
    if (!el || phase !== 'spiel') return;
    // The first world was built before the stage existed, from the page's
    // palette. Now the stage is here, take its colours instead.
    if (welt.current) Object.assign(welt.current, farben(el));
    const messen = () => {
      const b = el.clientWidth || SICHT_MAX;
      const s = Math.max(SICHT_MIN, Math.min(SICHT_MAX, b));
      setSicht(s);
      setSkala(b / s);
    };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  // --- the loop ---------------------------------------------------------------------------

  useEffect(() => {
    if (phase !== 'spiel') return;
    const c = leinwand.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(sicht * skala * dpr);
    c.height = Math.round(HOEHE * skala * dpr);

    const bild = (now: number) => {
      const w = welt.current;
      if (!w) return;
      let dt = Math.min(0.1, (now - w.letzte) / 1000);
      w.letzte = now;

      if (!w.pausiert) {
        w.acc += dt;
        while (w.acc >= SCHRITT) {
          let e = w.eingabe;
          if (w.auto !== null && !w.beantwortet) {
            const z = w.station.ziele[w.auto];
            if (z) {
              const zx = anlaufX(z, w.t);
              const d = zx - w.held.x;
              const da = Math.abs(d) <= 3;
              // Keeps chasing until the answer lands: a duck moves while the
              // hero is in the air, and a jump that misses just gets another.
              e = { links: d < -3, rechts: d > 3, springen: da && w.held.amBoden };
            }
          }
          const r = schritt(w.held, e, w.station, w.t, w.verbraucht);
          w.held = r.held;
          w.t += SCHRITT;
          w.acc -= SCHRITT;
          // A press is one jump, not a pogo stick.
          w.eingabe.springen = false;
          for (const ev of r.ereignisse) {
            if (ev.art === 'sprung') klangSpielen(KLANG_SPRUNG);
            else if (ev.art === 'landung')
              w.effekte.push({
                art: 'staub',
                x: w.held.x + HELD.breite / 2,
                y: w.held.y + HELD.hoehe,
                vx: 0,
                vy: 0,
                alter: 0,
                dauer: 0.3,
              });
            else if (ev.art === 'kopfstoss') {
              w.gestossen.set(ev.ziel.index, 0);
              beantworten(ev.ziel);
            } else if (ev.art === 'stampfer') {
              w.gestampft.set(ev.ziel.index, 0);
              beantworten(ev.ziel);
            }
          }
        }
      } else {
        dt = 0;
      }
      for (const [k, v] of w.gestossen) w.gestossen.set(k, v + dt);
      for (const [k, v] of w.gestampft) w.gestampft.set(k, v + dt);
      w.verletzt = Math.max(0, w.verletzt - dt);
      for (const ef of w.effekte) {
        ef.alter += dt;
        ef.x += ef.vx * dt;
        ef.y += ef.vy * dt;
        if (ef.art !== 'staub' && ef.art !== 'text') ef.vy += 700 * dt;
      }
      w.effekte = w.effekte.filter((ef) => ef.alter < ef.dauer);

      w.kamera = kameraX(w.held, w.station, sicht);
      zeichnen(ctx, w, skala * dpr, now / 1000, sicht);
      for (const z of w.station.ziele) {
        const el = etiketten.current.get(z.index);
        if (!el) continue;
        // A duck's label stands still over its lane: a thumb needs a target that
        // waits, and the duck walking under it says which one it means.
        const x = z.art === 'kiste' ? z.x + KISTE.breite / 2 : z.x;
        const y = z.art === 'kiste' ? z.y - 10 : z.y - 12;
        el.style.transform = `translate(${(x - w.kamera) * skala}px, ${y * skala}px) translate(-50%, -100%)`;
      }
      raf.current = requestAnimationFrame(bild);
    };
    raf.current = requestAnimationFrame(bild);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // The loop reads everything through refs; it only needs restarting when the
    // canvas changes size or the phase changes.
  }, [phase, skala, sicht]);

  useEffect(() => () => window.clearTimeout(uhr.current), []);

  // --- screens ---------------------------------------------------------------------------------

  if (phase === 'wahl') {
    return (
      <div className="ws">
        <header className="ws__kopf">
          <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
            ← Spiele
          </button>
          <h2>
            <span aria-hidden="true">🏃</span> Wortsprung {stufe}
          </h2>
        </header>
        <p className="notiz">
          Dieselben Karten wie im Sprachschatz — aber die Antwort wird{' '}
          <strong>gesprungen</strong>. Kopf gegen die richtige Kiste, oder auf die
          richtige Ente. Die richtige klingelt; die falsche kostet ein Herz.
        </p>
        <div className="kacheln">
          {[...KATEGORIEN, 'gemischt' as const].map((k) => (
            <button type="button" key={k} className="kachel" onClick={() => starten(k)}>
              <span className="kachel__name">{KATEGORIE_TEXT[k]}</span>
              <span className="kachel__fuss">
                Rekord {fortschrittLesen(stufe, k).bestePunkte} · {LEBEN} Leben
              </span>
            </button>
          ))}
        </div>
        <p className="notiz ws__steuerung">
          <strong>Steuerung:</strong> Pfeiltasten oder A/D laufen, ↑, W oder Leertaste
          springen. Auf dem Handy die Knöpfe unter dem Bild — oder eine Antwort antippen,
          dann läuft die Figur hin und springt.
        </p>
      </div>
    );
  }

  if (phase === 'ende') {
    const rekord = fortschrittLesen(stufe, kategorie);
    const falsche = verlauf.filter((v) => !v.richtig);
    return (
      <div className="ws">
        <header className="ws__kopf">
          <h2>{stand.leben <= 0 ? 'Alle Herzen weg' : 'Ziel erreicht!'}</h2>
        </header>
        <div className="ws__bilanz">
          <div className="punktestand">
            <span className="punktestand__zahl">{stand.punkte}</span>
            <span>Punkte</span>
          </div>
          <p className="notiz">
            {stand.richtig} richtig, {stand.falsch} falsch · beste Serie{' '}
            {stand.besteSerie} · Rekord {rekord.bestePunkte}
          </p>
        </div>
        {falsche.length > 0 && (
          <section className="ws__fehler">
            <h3>Noch einmal ansehen</h3>
            <ul>
              {falsche.map((v, i) => (
                <li key={i}>
                  <strong>{v.frage.frage}</strong>
                  <span className="notiz">
                    Richtig: <em>{v.frage.loesung}</em> — {v.frage.erklaerung}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="aktionen">
          <button
            type="button"
            className="knopf knopf--gross knopf--primaer"
            onClick={() => starten(kategorie)}
          >
            Noch eine Runde
          </button>
          <button type="button" className="knopf" onClick={() => setPhase('wahl')}>
            Andere Kategorie
          </button>
          <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
            Zurück
          </button>
        </div>
      </div>
    );
  }

  const w = welt.current;
  if (!w || !frage) return null;

  return (
    <div className="ws">
      <header className="ws__leiste">
        <button type="button" className="knopf knopf--sekundaer" onClick={onZurueck}>
          ← Spiele
        </button>
        <span
          className="pfad ws__pfad"
          aria-label={`Station ${nr + 1} von ${fragen.length}`}
        >
          {nr + 1}/{fragen.length}
        </span>
        <span className="leben" aria-label={`${stand.leben} Leben`}>
          {Array.from({ length: LEBEN }, (_, i) => (
            <span key={i} className={i < stand.leben ? 'leben__voll' : 'leben__leer'}>
              {i < stand.leben ? '♥' : '♡'}
            </span>
          ))}
        </span>
        <span className="punktestand ws__punkte">
          <span className="punktestand__zahl">{stand.punkte}</span>
          {stand.serie > 1 && <span className="serie">×{Math.min(5, stand.serie)}</span>}
        </span>
        <button
          type="button"
          className="knopf knopf--sekundaer"
          aria-pressed={ton}
          onClick={() => {
            klangSetzen(!ton);
            setTon(!ton);
          }}
        >
          {ton ? '🔊' : '🔇'}
        </button>
      </header>

      <div className="ws__frage" aria-live="polite">
        <span className="ws__hinweis">{frage.hinweis}</span>
        <strong>{frage.frage}</strong>
        {frage.vorlage && <span className="ws__vorlage">{frage.vorlage}</span>}
      </div>

      <div className="ws__buehne" ref={buehne} style={{ height: HOEHE * skala }}>
        <canvas
          ref={leinwand}
          className="ws__leinwand"
          style={{ width: sicht * skala, height: HOEHE * skala }}
          aria-hidden="true"
        />
        {w.station.ziele.map((z) => {
          const artikel = /^(der|die|das)$/.test(z.text) ? z.text : null;
          const zustand =
            urteil && urteil.ziel.index === z.index
              ? urteil.richtig
                ? 'richtig'
                : 'falsch'
              : urteil && istRichtig(frage, z.text)
                ? 'richtig'
                : w.verbraucht.has(z.index)
                  ? 'benutzt'
                  : '';
          return (
            <button
              type="button"
              key={`${nr}-${z.index}`}
              ref={(el) => {
                if (el) etiketten.current.set(z.index, el);
                else etiketten.current.delete(z.index);
              }}
              className={`ws__etikett ${artikel ? `ws__etikett--${artikel}` : ''} ${
                zustand ? `ws__etikett--${zustand}` : ''
              }`}
              data-ziel={z.index}
              data-art={z.art}
              disabled={w.beantwortet}
              onClick={() => {
                const welt2 = welt.current;
                if (welt2 && !welt2.beantwortet) welt2.auto = z.index;
              }}
            >
              {z.text}
            </button>
          );
        })}

        {urteil && (
          <div
            className={`ws__karte ws__karte--${urteil.richtig ? 'richtig' : 'falsch'}`}
            role="status"
          >
            <strong>{urteil.richtig ? 'Richtig!' : 'Leider falsch.'}</strong>
            {!urteil.richtig && (
              <p>
                Richtig wäre: <em>{frage.loesung}</em>
              </p>
            )}
            <p>{frage.erklaerung}</p>
            <button
              type="button"
              className="knopf knopf--primaer weiter"
              onClick={weiter}
              autoFocus
            >
              {stand.leben <= 0 || nr + 1 >= fragen.length ? 'Zum Ergebnis' : 'Weiter →'}
            </button>
          </div>
        )}
      </div>

      <div className="ws__steuer" aria-label="Steuerung">
        <button
          type="button"
          className="ws__knopf"
          aria-label="nach links"
          onPointerDown={(e) => {
            e.preventDefault();
            druecken('links', true);
          }}
          onPointerUp={() => druecken('links', false)}
          onPointerLeave={() => druecken('links', false)}
          onPointerCancel={() => druecken('links', false)}
        >
          ◀
        </button>
        <button
          type="button"
          className="ws__knopf"
          aria-label="nach rechts"
          onPointerDown={(e) => {
            e.preventDefault();
            druecken('rechts', true);
          }}
          onPointerUp={() => druecken('rechts', false)}
          onPointerLeave={() => druecken('rechts', false)}
          onPointerCancel={() => druecken('rechts', false)}
        >
          ▶
        </button>
        <button
          type="button"
          className="ws__knopf ws__knopf--sprung"
          aria-label="springen"
          onPointerDown={(e) => {
            e.preventDefault();
            if (welt.current?.pausiert) weiter();
            else druecken('springen', true);
          }}
        >
          ⤒
        </button>
      </div>
    </div>
  );
}

// --- drawing ----------------------------------------------------------------------

function zeichnen(
  ctx: CanvasRenderingContext2D,
  w: Welt,
  s: number,
  uhr: number,
  sicht: number,
) {
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const k = w.kamera;

  // Sky.
  const himmel = ctx.createLinearGradient(0, 0, 0, BODEN);
  himmel.addColorStop(0, '#bfe0ff');
  himmel.addColorStop(1, '#eef7ff');
  ctx.fillStyle = himmel;
  ctx.fillRect(0, 0, sicht, HOEHE);

  // Clouds, slow.
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 173 + 40 - k * 0.35 + 5000) % (sicht + 200)) - 100;
    const cy = 30 + (i % 3) * 28;
    wolke(ctx, cx, cy, 26 + (i % 2) * 10);
  }

  // Hills in the level's colour, two layers.
  ctx.fillStyle = w.farbeWeich;
  for (let i = -1; i < 8; i++) {
    const hx = i * 220 - ((k * 0.55) % 220);
    ctx.beginPath();
    ctx.ellipse(hx, BODEN + 10, 150, 70, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = mitAlpha(w.farbe, 0.28);
  for (let i = -1; i < 10; i++) {
    const hx = i * 160 + 60 - ((k * 0.8) % 160);
    ctx.beginPath();
    ctx.ellipse(hx, BODEN + 6, 100, 42, 0, Math.PI, 0);
    ctx.fill();
  }

  // Ground.
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, BODEN, sicht, HOEHE - BODEN);
  ctx.fillStyle = '#4caf50';
  ctx.fillRect(0, BODEN, sicht, 7);
  ctx.fillStyle = '#3d9142';
  for (let x = -((k * 1) % 24); x < sicht; x += 24) {
    ctx.fillRect(x, BODEN + 7, 12, 3);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = -((k * 1) % 40); x < sicht; x += 40) {
    ctx.fillRect(x, BODEN + 22, 20, 4);
    ctx.fillRect(x + 20, BODEN + 40, 20, 4);
  }

  // Boxes.
  for (const z of w.station.ziele) {
    if (z.art !== 'kiste') continue;
    const stoss = w.gestossen.get(z.index);
    const hub =
      stoss !== undefined && stoss < 0.28 ? -10 * Math.sin((stoss / 0.28) * Math.PI) : 0;
    const benutzt = w.verbraucht.has(z.index);
    kiste(ctx, z.x - k, z.y + hub, benutzt, uhr);
  }

  // Ducks.
  for (const z of w.station.ziele) {
    if (z.art !== 'ente') continue;
    const platt = w.gestampft.get(z.index);
    if (platt !== undefined) {
      if (platt > 0.6) continue;
      ente(
        ctx,
        entenX(z, w.t) - k,
        z.y,
        1,
        uhr,
        Math.max(0.2, 1 - platt / 0.6),
        1 - platt / 0.6,
      );
      continue;
    }
    if (w.verbraucht.has(z.index)) continue;
    ente(ctx, entenX(z, w.t) - k, z.y, entenBlick(z, w.t), w.t, 1, 1);
  }

  // Hero, blinking while hurt.
  const blinkt = w.verletzt > 0 && Math.floor(uhr * 16) % 2 === 0;
  if (!blinkt) held(ctx, w.held.x - k, w.held.y, w.held, w.farbe);

  // Effects.
  for (const ef of w.effekte) {
    const rest = 1 - ef.alter / ef.dauer;
    ctx.globalAlpha = Math.max(0, Math.min(1, rest * 1.4));
    if (ef.art === 'muenze') {
      ctx.fillStyle = '#f6c445';
      ctx.beginPath();
      ctx.ellipse(
        ef.x - k,
        ef.y,
        5 * Math.abs(Math.cos(ef.alter * 12)) + 1,
        5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (ef.art === 'herz') {
      ctx.fillStyle = '#e0334a';
      herz(ctx, ef.x - k, ef.y, 6);
    } else if (ef.art === 'staub') {
      ctx.fillStyle = 'rgba(120,90,60,0.5)';
      const r = 4 + ef.alter * 30;
      ctx.beginPath();
      ctx.ellipse(ef.x - k - 8, ef.y, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(ef.x - k + 8, ef.y, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (ef.art === 'text' && ef.text) {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1b6d2f';
      ctx.fillText(ef.text, ef.x - k, ef.y);
    }
    ctx.globalAlpha = 1;
  }
}

function mitAlpha(farbe: string, a: number): string {
  // Accepts #rgb / #rrggbb; anything else is used as is.
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(farbe.trim());
  if (!m) return farbe;
  let hex = m[1]!;
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function wolke(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.arc(x + r * 0.6, y - r * 0.25, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 1.3, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function kiste(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  benutzt: boolean,
  uhr: number,
) {
  const b = KISTE.breite;
  const h = KISTE.hoehe;
  ctx.fillStyle = benutzt ? '#9a8f85' : '#f0b53a';
  ctx.fillRect(x, y, b, h);
  ctx.strokeStyle = benutzt ? '#6f655c' : '#a2701a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, b - 2, h - 2);
  // Rivets.
  ctx.fillStyle = benutzt ? '#6f655c' : '#a2701a';
  for (const [dx, dy] of [
    [4, 4],
    [b - 7, 4],
    [4, h - 7],
    [b - 7, h - 7],
  ] as const) {
    ctx.fillRect(x + dx, y + dy, 3, 3);
  }
  if (!benutzt) {
    const puls = 1 + Math.sin(uhr * 5) * 0.05;
    ctx.font = `bold ${Math.round(20 * puls)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#7a5210';
    ctx.strokeText('?', x + b / 2, y + h / 2 + 1);
    ctx.fillStyle = '#fff7dc';
    ctx.fillText('?', x + b / 2, y + h / 2 + 1);
  }
}

function ente(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  blick: 1 | -1,
  t: number,
  hoehe: number,
  alpha: number,
) {
  const b = ENTE.breite;
  const h = ENTE.hoehe * hoehe;
  const boden = y + ENTE.hoehe;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + b / 2, boden);
  ctx.scale(blick, 1);
  // Feet, waddling.
  ctx.fillStyle = '#f08c1a';
  const schritt = Math.sin(t * 9) * 3;
  ctx.fillRect(-9 + schritt, -3, 7, 3);
  ctx.fillRect(2 - schritt, -3, 7, 3);
  // Body.
  ctx.fillStyle = '#f6c445';
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.45, b / 2, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wing.
  ctx.fillStyle = '#e0aa2c';
  ctx.beginPath();
  ctx.ellipse(-3, -h * 0.45, b / 4, h * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = '#f6c445';
  ctx.beginPath();
  ctx.arc(b / 2 - 5, -h * 0.85, h * 0.32, 0, Math.PI * 2);
  ctx.fill();
  // Bill.
  ctx.fillStyle = '#f08c1a';
  ctx.fillRect(b / 2 - 1, -h * 0.9, 9, 4);
  // Eye.
  ctx.fillStyle = '#1b2026';
  ctx.fillRect(b / 2 - 5, -h * 0.98, 2.5, 2.5);
  ctx.restore();
}

function held(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: Held,
  farbe: string,
) {
  const b = HELD.breite;
  const hh = HELD.hoehe;
  ctx.save();
  ctx.translate(x + b / 2, y);
  ctx.scale(h.blick, 1);
  const bein = h.amBoden ? (Math.floor(h.lauf * 9) % 2 === 0 ? 1 : -1) : 0;
  const luft = !h.amBoden;
  // Legs.
  ctx.fillStyle = '#2b3a67';
  if (luft) {
    ctx.fillRect(-8, hh - 12, 6, 12);
    ctx.fillRect(3, hh - 14, 6, 12);
  } else if (h.vx === 0) {
    ctx.fillRect(-7, hh - 12, 6, 12);
    ctx.fillRect(2, hh - 12, 6, 12);
  } else {
    ctx.fillRect(-8 + bein * 3, hh - 12, 6, 12);
    ctx.fillRect(3 - bein * 3, hh - 12, 6, 12);
  }
  // Shoes.
  ctx.fillStyle = '#5b3a1a';
  ctx.fillRect(-9 + (luft ? 0 : bein * 3), hh - 3, 8, 3);
  ctx.fillRect(2 - (luft ? 0 : bein * 3), hh - 3, 8, 3);
  // Body in the level's colour.
  ctx.fillStyle = farbe;
  ctx.fillRect(-8, 10, 16, 10);
  // Arms.
  ctx.fillStyle = '#f1c9a5';
  ctx.fillRect(-11, 11, 3, 7 + (luft ? -3 : 0));
  ctx.fillRect(8, 11 - (luft ? 5 : 0), 3, 7);
  // Head.
  ctx.fillStyle = '#f1c9a5';
  ctx.fillRect(-6, 1, 12, 10);
  // Cap.
  ctx.fillStyle = farbe;
  ctx.fillRect(-7, -2, 14, 4);
  ctx.fillRect(-7, 1, 17, 2);
  // Eye and smile.
  ctx.fillStyle = '#1b2026';
  ctx.fillRect(2, 4, 2, 2);
  ctx.fillRect(1, 8, 4, 1);
  ctx.restore();
}

function herz(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r);
  ctx.fill();
}
