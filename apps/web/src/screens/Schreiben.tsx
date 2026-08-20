import type { OeffentlichePruefung } from '@pruefung/core';

interface Props {
  pruefung: OeffentlichePruefung;
  texte: Record<string, string>;
  onText: (nummer: number, text: string) => void;
  abgelaufen: boolean;
}

const zaehleWoerter = (text: string): number =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

/**
 * The A1 form travels through the same single-string channel as every other
 * written answer, as `Feld: Eintrag` lines. That keeps the submission ZIP
 * readable for the teacher who marks it, and lets the entries survive a reload
 * without a second store.
 */
function formularLesen(text: string): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const zeile of text.split('\n')) {
    const trenner = zeile.indexOf(':');
    if (trenner > 0)
      werte[zeile.slice(0, trenner).trim()] = zeile.slice(trenner + 1).trim();
  }
  return werte;
}

function formularSchreiben(felder: string[], werte: Record<string, string>): string {
  return felder.map((f) => `${f}: ${werte[f] ?? ''}`).join('\n');
}

export function Schreiben({ pruefung, texte, onText, abgelaufen }: Props) {
  // B2 states a floor — "mindestens 150 Wörter" — and marks a text that falls
  // under it down for content. B1 states a target you can also overshoot. The
  // counter has to say which, or it gives the wrong advice at one of the levels.
  const mindestmass = pruefung.meta.stufe === 'B2';

  return (
    <div className="modul">
      <p className="notiz">
        Ihre Texte werden nicht automatisch bewertet. Nach der Abgabe können Sie sie
        zusammen mit den Sprachaufnahmen als ZIP herunterladen und Ihrer Lehrkraft geben.
      </p>

      {pruefung.schreiben.aufgaben.map((aufgabe) => {
        const text = texte[String(aufgabe.nummer)] ?? '';
        const woerter = zaehleWoerter(text);
        // Examiners accept a reasonable band around the target; far below it
        // costs marks under "Erfüllung", so the counter shows the state rather
        // than just a number.
        const untergrenze = mindestmass ? aufgabe.woerter : aufgabe.woerter * 0.7;
        const zustand =
          woerter === 0
            ? 'leer'
            : woerter < untergrenze
              ? 'kurz'
              : woerter > aufgabe.woerter * 1.8
                ? 'lang'
                : 'gut';

        // A1 opens with a form rather than a text: five labelled blanks, one
        // point each, and no word count to show.
        if (aufgabe.formular) {
          const labels = aufgabe.formular.map((f) => f.feld);
          const werte = formularLesen(text);
          return (
            <section className="teil" key={aufgabe.nummer}>
              <header className="teil__kopf">
                <h2>Aufgabe {aufgabe.nummer}</h2>
                <span className="teil__meta">
                  {aufgabe.zeitMinuten} Min. · {aufgabe.punkte} Punkte
                </span>
              </header>

              <p className="situation">{aufgabe.situation}</p>
              <p className="teil__anweisung">{aufgabe.aufgabenstellung}</p>

              <div className="formular">
                {labels.map((label, i) => (
                  <label className="formular__zeile" key={label}>
                    <span className="formular__feld">
                      <span className="formular__nr">{i + 1}</span>
                      {label}
                    </span>
                    <input
                      type="text"
                      value={werte[label] ?? ''}
                      disabled={abgelaufen}
                      onChange={(e) =>
                        onText(
                          aufgabe.nummer,
                          formularSchreiben(labels, {
                            ...werte,
                            [label]: e.target.value,
                          }),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          );
        }

        return (
          <section className="teil" key={aufgabe.nummer}>
            <header className="teil__kopf">
              <h2>Aufgabe {aufgabe.nummer}</h2>
              <span className="teil__meta">
                {mindestmass ? 'mind.' : 'ca.'} {aufgabe.woerter} Wörter ·{' '}
                {aufgabe.zeitMinuten} Min. · {aufgabe.punkte} Punkte
              </span>
            </header>

            <p className="situation">{aufgabe.situation}</p>
            {aufgabe.impuls && (
              <blockquote className="impuls">{aufgabe.impuls}</blockquote>
            )}
            <p className="teil__anweisung">{aufgabe.aufgabenstellung}</p>

            <ul className="leitpunkte">
              {aufgabe.leitpunkte.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>

            {aufgabe.anrede && (
              <p className="notiz">
                Beginnen Sie zum Beispiel mit: <em>{aufgabe.anrede},</em>
              </p>
            )}

            <textarea
              className="schreibfeld"
              value={text}
              rows={12}
              disabled={abgelaufen}
              spellCheck={false}
              placeholder="Schreiben Sie hier Ihren Text …"
              onChange={(e) => onText(aufgabe.nummer, e.target.value)}
              aria-label={`Text für Aufgabe ${aufgabe.nummer}`}
            />

            <div className={`zaehler zaehler--${zustand}`} role="status">
              {woerter} Wörter
              {zustand === 'kurz' &&
                (mindestmass
                  ? ` — unter den geforderten ${aufgabe.woerter}`
                  : ' — noch deutlich unter der Zielmarke')}
              {zustand === 'lang' && ' — deutlich länger als verlangt'}
              {zustand === 'gut' && ' — Länge passt'}
            </div>
          </section>
        );
      })}
    </div>
  );
}
