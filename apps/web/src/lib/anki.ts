/**
 * Export the exam's vocabulary as an Anki deck.
 *
 * Anki's own .apkg is a zipped SQLite database, which would mean shipping a
 * SQL engine to the browser. Anki imports tab-separated text natively, so that
 * is what this produces — the format is stable, human-readable, and works in
 * every Anki client as well as in Quizlet and a spreadsheet.
 */

import type { GlossarEintrag, Redewendung } from '@b1/core';

/** Anki treats a literal tab or newline inside a field as a column break. */
function feld(text: string): string {
  return text.replace(/[\t\r\n]+/g, ' ').trim();
}

function vorderseite(g: GlossarEintrag): string {
  if (g.wortart === 'nomen' && g.artikel) {
    const kern = g.lemma.replace(/^(der|die|das)\s+/i, '');
    return `${g.artikel} ${kern}`;
  }
  return g.lemma;
}

/**
 * Everything a learner must actually memorise, not just the translation:
 * plural for nouns, all principal parts for verbs, and the governed
 * preposition with its case — that last one is what most B1 learners lose
 * marks on.
 */
function rueckseite(g: GlossarEintrag): string {
  const teile = [`<b>${g.bedeutung_en}</b>`];
  if (g.bedeutung_de) teile.push(g.bedeutung_de);

  if (g.wortart === 'nomen' && g.plural) teile.push(`Plural: ${g.plural}`);

  if (g.wortart === 'verb' && g.stammformen) {
    const s = g.stammformen;
    const marks = [
      s.unregelmaessig ? 'unregelmäßig' : null,
      g.trennbar ? 'trennbar' : null,
    ].filter(Boolean);
    teile.push(
      `${s.praesens_3sg} · ${s.praeteritum} · ${s.perfekt}` +
        (marks.length ? ` (${marks.join(', ')})` : ''),
    );
  }

  if (g.praeposition) {
    teile.push(`+ ${g.praeposition.wort} + ${g.praeposition.kasus}`);
  }

  teile.push(`<i>${g.beispiel}</i>`);
  return teile.map(feld).join('<br>');
}

export function ankiTsv(
  glossar: ReadonlyArray<GlossarEintrag>,
  redewendungen: ReadonlyArray<Redewendung> = [],
  deckName = 'B1-Prüfungstrainer',
): string {
  // Anki reads these header directives on import and configures itself.
  const zeilen = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    `#deck:${deckName}`,
    '#tags column:4',
  ];

  for (const g of glossar) {
    zeilen.push(
      [
        feld(vorderseite(g)),
        rueckseite(g),
        '',
        feld(`${g.wortart} ${g.fundstelle.replace(/\s+/g, '-')} ${g.niveau ?? 'B1'}`),
      ].join('\t'),
    );
  }

  for (const r of redewendungen) {
    zeilen.push(
      [
        feld(r.wendung),
        feld(`<b>${r.bedeutung_en}</b><br>${r.bedeutung_de}<br><i>${r.beispiel}</i>`),
        '',
        feld(`redewendung ${r.fundstelle.replace(/\s+/g, '-')}`),
      ].join('\t'),
    );
  }

  return zeilen.join('\n') + '\n';
}
