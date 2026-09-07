/**
 * Handing a file to the browser.
 *
 * All that remains of what used to be a small ZIP writer. That existed to
 * package a candidate's writing and recordings into a submission; there are no
 * submissions and no recordings any more, and the one thing the app still
 * hands over is the Anki deck, which is a single text file.
 */

export function herunterladen(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
