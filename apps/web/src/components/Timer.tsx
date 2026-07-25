import { useEffect, useRef, useState } from 'react';

/**
 * Countdown that survives a reload and cannot be paused.
 *
 * Time is derived from a wall-clock deadline rather than counted down in
 * state, so closing the tab, backgrounding it, or letting the browser throttle
 * timers does not hand back extra minutes. That matters: a candidate who
 * refreshes must not get a fresh 65 minutes.
 */
export function useCountdown(deadline: number | null, onExpire: () => void) {
  const [rest, setRest] = useState(() =>
    deadline ? Math.max(0, deadline - Date.now()) : 0,
  );
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
  }, [deadline]);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const ms = Math.max(0, deadline - Date.now());
      setRest(ms);
      if (ms === 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadline, onExpire]);

  return rest;
}

export function formatiereZeit(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

interface Props {
  restMs: number;
  label: string;
}

export function Timer({ restMs, label }: Props) {
  const minuten = restMs / 60000;
  const stufe = minuten <= 5 ? 'kritisch' : minuten <= 10 ? 'warnung' : 'normal';

  return (
    <div className={`timer timer--${stufe}`} role="timer" aria-live="off">
      <span className="timer__label">{label}</span>
      <strong className="timer__wert">{formatiereZeit(restMs)}</strong>
      {stufe !== 'normal' && (
        <span className="timer__hinweis" role="status">
          {stufe === 'kritisch' ? 'Noch 5 Minuten!' : 'Noch 10 Minuten'}
        </span>
      )}
    </div>
  );
}
