import type { Beispiel, OeffentlichesItem } from '@b1/core';

const ANZEIGEN_BUCHSTABEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', '0'];

interface Props {
  item: OeffentlichesItem;
  wert: string | undefined;
  onChange: (wert: string) => void;
  disabled?: boolean;
}

/**
 * One answerable item. Which control appears is driven entirely by `item.typ`,
 * so the five reading task types and four listening task types all render from
 * the same component and no screen has to know about item shapes.
 */
export function Item({ item, wert, onChange, disabled }: Props) {
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
          ? ANZEIGEN_BUCHSTABEN.map((b) => ({
              value: b,
              label: b === '0' ? '0 — keine passt' : b,
            }))
          : [
              { value: 'a', label: item.optionen?.a ?? 'a' },
              { value: 'b', label: item.optionen?.b ?? 'b' },
              { value: 'c', label: item.optionen?.c ?? 'c' },
            ];

  const kompakt = item.typ === 'zuordnung_anzeigen';

  return (
    <fieldset className={`item ${wert ? 'item--beantwortet' : ''}`} disabled={disabled}>
      <legend className="item__frage">
        <span className="item__nr">{item.nr}</span>
        <span>{item.frage}</span>
      </legend>

      <div className={kompakt ? 'item__optionen item__optionen--kompakt' : 'item__optionen'}>
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
        {beispiel.optionen && ` — ${beispiel.optionen[beispiel.loesung as 'a' | 'b' | 'c']}`}
      </p>
      <p className="beispiel__grund">{beispiel.begruendung.de}</p>
    </div>
  );
}
