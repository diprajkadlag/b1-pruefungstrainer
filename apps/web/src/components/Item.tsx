import type { Beispiel, OeffentlichesItem } from '@pruefung/core';

interface Props {
  item: OeffentlichesItem;
  wert: string | undefined;
  onChange: (wert: string) => void;
  disabled?: boolean;
  /**
   * The letters this item may be answered with, for every task whose
   * alternatives live on the Teil rather than on the item — the B2 matching
   * tasks, and the small ads at A2 and B1. Ignored otherwise.
   *
   * It has to be passed rather than assumed: B1 offers ten ads and a 0, A2
   * offers six and an x, and printing ten boxes under a paper that has six
   * would be wrong on the page as well as in the answer.
   */
  buchstaben?: string[];
}

/**
 * One answerable item. Which control appears is driven entirely by `item.typ`,
 * so every reading and listening task type at both levels renders from the same
 * component and no screen has to know about item shapes.
 */
export function Item({ item, wert, onChange, disabled, buchstaben }: Props) {
  const name = `item-${item.nr}`;

  const optionen: { value: string; label: string }[] =
    item.typ === 'richtig_falsch'
      ? [
          { value: 'richtig', label: 'Richtig' },
          { value: 'falsch', label: 'Falsch' },
        ]
      : item.typ === 'ja_nein'
        ? [
            { value: 'ja', label: 'Ja — dafür' },
            { value: 'nein', label: 'Nein — dagegen' },
          ]
        : item.typ === 'zuordnung_anzeigen'
          ? (buchstaben ?? []).map((b) => ({
              value: b,
              label: /^[a-j]$/.test(b) ? b : `${b} — keine passt`,
            }))
          : item.typ === 'zuordnung_buchstabe'
            ? (buchstaben ?? []).map((b) => ({ value: b, label: b }))
            : // Multiple choice and person-matching. Three options everywhere
              // except B2 Lesen Teil 1, which matches statements to four
              // writers, so the fourth is included only when the item has one.
              (['a', 'b', 'c', 'd'] as const)
                .filter((k) => item.optionen?.[k])
                .map((k) => ({ value: k, label: item.optionen?.[k] ?? k }));

  const kompakt = item.typ === 'zuordnung_anzeigen' || item.typ === 'zuordnung_buchstabe';

  return (
    <fieldset className={`item ${wert ? 'item--beantwortet' : ''}`} disabled={disabled}>
      <legend className="item__frage">
        <span className="item__nr">{item.nr}</span>
        <span>{item.frage}</span>
      </legend>

      <div
        className={kompakt ? 'item__optionen item__optionen--kompakt' : 'item__optionen'}
      >
        {optionen.map((opt) => (
          <label
            key={opt.value}
            className={`option ${wert === opt.value ? 'option--gewaehlt' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={wert === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {!kompakt && <span className="option__marke">{opt.value.slice(0, 1)}</span>}
            <span className="option__text">{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The worked example. Shown with its answer already marked, never editable. */
export function BeispielItem({ beispiel }: { beispiel: Beispiel }) {
  return (
    <div className="beispiel">
      <span className="beispiel__marke">Beispiel</span>
      <p className="beispiel__frage">{beispiel.frage}</p>
      <p className="beispiel__loesung">
        Lösung: <strong>{beispiel.loesung}</strong>
        {beispiel.optionen &&
          ` — ${beispiel.optionen[beispiel.loesung as 'a' | 'b' | 'c' | 'd']}`}
      </p>
      <p className="beispiel__grund">{beispiel.begruendung.de}</p>
    </div>
  );
}
