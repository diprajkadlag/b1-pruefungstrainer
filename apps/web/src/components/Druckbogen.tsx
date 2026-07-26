/**
 * Links to the printable version of a paper.
 *
 * Two audiences, one component. Before the exam a candidate may want the
 * Kandidatenblätter and an Antwortbogen on paper — sitting the reading module
 * on paper is closer to the real thing than sitting it on a laptop. Afterwards
 * they want the Lösungsheft to cross-check against.
 *
 * The split is not cosmetic: `loesungen.pdf` is the printed twin of the answer
 * key and is offered only once an attempt is closed, the same rule the JSON
 * follows. `phase` decides which set is shown, and the caller cannot pass
 * "loesungen" in the wrong phase because the two lists come from the registry
 * separately.
 */

import {
  PDF_BESCHREIBUNG,
  PDF_TITEL,
  RELEASE_URL,
  pdfUrl,
  type PdfName,
} from '../lib/content';

export function Druckbogen({
  examId,
  dateien,
  titel,
  hinweis,
}: {
  examId: string;
  dateien: PdfName[];
  titel: string;
  hinweis?: string;
}) {
  if (dateien.length === 0) {
    // No LaTeX where this was built. Say so plainly rather than showing dead
    // links, and point at the release, which always carries them.
    return (
      <div className="druck druck--leer">
        <h3>{titel}</h3>
        <p className="notiz">
          Für diese Installation wurden keine PDFs erzeugt. Alle Prüfungsbögen und
          Lösungshefte liegen als <code>pdfs.zip</code> beim{' '}
          <a href={RELEASE_URL} target="_blank" rel="noreferrer">
            neuesten Release
          </a>
          . Wer sie selbst bauen möchte: <code>npm run content:pdf</code> (braucht LaTeX).
        </p>
      </div>
    );
  }

  return (
    <div className="druck">
      <h3>{titel}</h3>
      {hinweis && <p className="notiz">{hinweis}</p>}
      <ul className="druck__liste">
        {dateien.map((name) => (
          <li key={name}>
            <a
              className="druck__link"
              href={pdfUrl(examId, name)}
              target="_blank"
              rel="noreferrer"
            >
              <span className="druck__titel">{PDF_TITEL[name]}</span>
              <span className="druck__art">PDF</span>
            </a>
            <span className="notiz">{PDF_BESCHREIBUNG[name]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
