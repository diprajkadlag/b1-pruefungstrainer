/**
 * The two sounds the game makes, synthesised.
 *
 * No files: the notes live in `@pruefung/core` as numbers and are played
 * through Web Audio, so there is nothing to fetch, nothing to cache, nothing
 * to license, and no binary in a repository whose premise is that the content
 * is text. It also works offline on the first visit, which an audio file
 * pulled from the network would not.
 *
 * Everything here fails silently. A browser with no Web Audio, a device with
 * no output, a policy that blocks the context — none of that is a reason for a
 * learner to lose the round they are playing, and none of it is worth an error
 * message about a beep.
 */

import { KLANG_LAUTSTAERKE, KLANG_SCHLUESSEL, klangFuer, type Ton } from '@pruefung/core';

let kontext: AudioContext | null = null;

/**
 * The audio context, made on first use.
 *
 * Deliberately lazy: browsers refuse to start one outside a user gesture, and
 * creating it at import time gets it born suspended and silent. First use is
 * always inside a click on an answer, which is exactly the gesture that
 * satisfies the policy.
 */
function holen(): AudioContext | null {
  if (kontext) return kontext;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    kontext = new Ctor();
    return kontext;
  } catch {
    return null;
  }
}

export function klangAn(): boolean {
  try {
    // On unless switched off: a game with no sound at all is not what most
    // people expect, and the switch is one tap away in the bar.
    return localStorage.getItem(KLANG_SCHLUESSEL) !== 'aus';
  } catch {
    return true;
  }
}

export function klangSetzen(an: boolean): void {
  try {
    localStorage.setItem(KLANG_SCHLUESSEL, an ? 'an' : 'aus');
  } catch {
    // A blocked store costs the preference, not the sound.
  }
}

function tonSpielen(ctx: AudioContext, ton: Ton, start: number): void {
  const quelle = ctx.createOscillator();
  const huelle = ctx.createGain();
  // A sine is the least abrasive shape there is, which matters for something
  // that fires on every single card.
  quelle.type = 'sine';
  quelle.frequency.setValueAtTime(ton.hz, start);

  // Ramped rather than switched. A gain that jumps from 0 is a click, and the
  // click is louder and nastier than the note it introduces.
  huelle.gain.setValueAtTime(0.0001, start);
  huelle.gain.exponentialRampToValueAtTime(KLANG_LAUTSTAERKE, start + 0.012);
  huelle.gain.exponentialRampToValueAtTime(0.0001, start + ton.dauer);

  quelle.connect(huelle).connect(ctx.destination);
  quelle.start(start);
  quelle.stop(start + ton.dauer + 0.02);
}

/** Play the sound for an answer. Does nothing if sound is off. */
export function antwortKlang(richtig: boolean): void {
  if (!klangAn()) return;
  const ctx = holen();
  if (!ctx) return;
  try {
    // Tabs suspend the context when they lose focus; it stays suspended until
    // asked, so a learner coming back to the tab would otherwise get silence
    // for the rest of the session.
    if (ctx.state === 'suspended') void ctx.resume();
    const jetzt = ctx.currentTime;
    for (const ton of klangFuer(richtig)) tonSpielen(ctx, ton, jetzt + ton.ab);
  } catch {
    // Nothing here is worth interrupting a round for.
  }
}
