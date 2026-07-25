import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  /** Part number, used only for labelling. */
  teil: number;
  /** Already played once in this attempt — the part is then locked forever. */
  gesperrt: boolean;
  onStart: () => void;
  onEnde: () => void;
}

/**
 * Listening player under examination conditions.
 *
 * In the hall the recording plays once, start to finish, and nobody can pause,
 * rewind or hear it again. Practising with a normal audio element teaches the
 * wrong habits, so this one:
 *
 *  - offers a single Start button and no transport controls
 *  - refuses to seek (any attempt snaps the position back)
 *  - cannot be paused; blurring or hiding the tab does not stop playback
 *  - locks the part permanently once it has been played
 *
 * The repeats a part is entitled to are already inside the audio file, so the
 * candidate hears "zweimal" without the player needing to replay anything.
 */
export function HoerPlayer({ src, teil, gesperrt, onStart, onEnde }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const zuletzt = useRef(0);
  const [laeuft, setLaeuft] = useState(false);
  const [position, setPosition] = useState(0);
  const [dauer, setDauer] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;

    const onTime = () => {
      // Guard against a seek: only ever move forward, and only by about as
      // much as real playback could have advanced.
      if (el.currentTime > zuletzt.current + 1.5 || el.currentTime < zuletzt.current - 0.3) {
        el.currentTime = zuletzt.current;
        return;
      }
      zuletzt.current = el.currentTime;
      setPosition(el.currentTime);
    };
    const onPause = () => {
      // Nothing but reaching the end may stop playback.
      if (!el.ended && laeuft) void el.play().catch(() => undefined);
    };
    const onEnded = () => {
      setLaeuft(false);
      onEnde();
    };
    const onMeta = () => setDauer(el.duration || 0);
    const onError = () =>
      setFehler('Die Audiodatei konnte nicht geladen werden. Ist sie heruntergeladen?');

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('error', onError);
    };
  }, [laeuft, onEnde]);

  async function starten() {
    const el = audio.current;
    if (!el || gesperrt) return;
    setFehler(null);
    zuletzt.current = 0;
    try {
      await el.play();
      setLaeuft(true);
      onStart();
    } catch {
      setFehler('Wiedergabe blockiert. Bitte tippen Sie erneut auf „Abspielen“.');
    }
  }

  const anteil = dauer > 0 ? Math.min(1, position / dauer) : 0;

  return (
    <div className="player">
      <audio ref={audio} src={src} preload="auto" />

      {!laeuft && !gesperrt && (
        <button type="button" className="knopf knopf--gross" onClick={starten}>
          ▶ Teil {teil} abspielen
        </button>
      )}

      {laeuft && (
        <div className="player__lauf" role="status">
          <div className="player__balken">
            <div className="player__fortschritt" style={{ width: `${anteil * 100}%` }} />
          </div>
          <span className="player__text">
            Läuft — Pausieren und Zurückspulen sind nicht möglich.
          </span>
        </div>
      )}

      {gesperrt && !laeuft && (
        <p className="player__gesperrt">
          Teil {teil} wurde bereits abgespielt. In der Prüfung hören Sie jeden Teil nur
          einmal.
        </p>
      )}

      {!gesperrt && !laeuft && (
        <p className="player__hinweis">
          Lesen Sie zuerst die Aufgaben. Der Text startet erst, wenn Sie auf „Abspielen“
          tippen — danach läuft er ohne Unterbrechung durch.
        </p>
      )}

      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  );
}
