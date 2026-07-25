import type { LesenTeil, OeffentlichePruefung } from '@b1/core';
import { BeispielItem, Item } from '../components/Item';

interface Props {
  pruefung: OeffentlichePruefung;
  antworten: Record<string, string>;
  onAntwort: (nr: number, wert: string) => void;
  abgelaufen: boolean;
}

export function Lesen({ pruefung, antworten, onAntwort, abgelaufen }: Props) {
  return (
    <div className="modul">
      {pruefung.lesen.teile.map((teil) => (
        <TeilAnsicht
          key={teil.nummer}
          teil={teil}
          antworten={antworten}
          onAntwort={onAntwort}
          abgelaufen={abgelaufen}
        />
      ))}
    </div>
  );
}

function TeilAnsicht({
  teil,
  antworten,
  onAntwort,
  abgelaufen,
}: {
  teil: LesenTeil;
  antworten: Record<string, string>;
  onAntwort: (nr: number, wert: string) => void;
  abgelaufen: boolean;
}) {
  const beantwortet = teil.items.filter((i) => antworten[String(i.nr)]).length;

  return (
    <section className="teil" aria-labelledby={`lesen-teil-${teil.nummer}`}>
      <header className="teil__kopf">
        <h2 id={`lesen-teil-${teil.nummer}`}>Teil {teil.nummer}</h2>
        <span className="teil__meta">
          {beantwortet}/{teil.items.length} · empfohlen {teil.richtzeitMinuten} Min.
        </span>
      </header>
      <p className="teil__anweisung">{teil.anweisung}</p>

      {teil.these && <p className="these">{teil.these}</p>}

      {teil.texte?.map((t) => (
        <article className="lesetext" key={t.id}>
          {t.titel && <h3>{t.titel}</h3>}
          {t.quelle && <p className="lesetext__quelle">{t.quelle}</p>}
          {t.inhalt.split('\n\n').map((absatz, i) => (
            <p key={i}>
              {absatz.split('\n').map((zeile, j, alle) => (
                <span key={j}>
                  {zeile}
                  {j < alle.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))}
        </article>
      ))}

      {teil.beispiel && <BeispielItem beispiel={teil.beispiel} />}

      <div className="items">
        {teil.items.map((item) => (
          <Item
            key={item.nr}
            item={item}
            wert={antworten[String(item.nr)]}
            onChange={(wert) => onAntwort(item.nr, wert)}
            disabled={abgelaufen}
          />
        ))}
      </div>

      {/* Teil 3's ads come after the situations, matching the printed paper. */}
      {teil.anzeigen && (
        <div className="anzeigen">
          <h3>Anzeigen</h3>
          <div className="anzeigen__gitter">
            {teil.anzeigen.map((a) => (
              <article className="anzeige" key={a.buchstabe}>
                <h4>
                  <span className="anzeige__buchstabe">{a.buchstabe}</span> {a.titel}
                </h4>
                <p>{a.inhalt}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
