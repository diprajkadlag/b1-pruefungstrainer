import { STUFEN } from '@pruefung/core';
import type {
  LesenTeil,
  OeffentlichePruefung,
  PruefungsText,
  Stufe,
} from '@pruefung/core';
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
          stufe={pruefung.meta.stufe}
          antworten={antworten}
          onAntwort={onAntwort}
          abgelaufen={abgelaufen}
        />
      ))}
    </div>
  );
}

/**
 * A B2 text with gaps marks each one as its item number in square brackets.
 * Rendering it means splitting on those markers and showing a numbered slot
 * where the sentence or heading is missing, so the candidate can see which gap
 * a given item refers to without counting paragraphs.
 */
function AbsatzMitLuecken({ absatz }: { absatz: string }) {
  const stuecke = absatz.split(/(\[\d{1,2}\])/g);
  return (
    <>
      {stuecke.map((stueck, i) => {
        const treffer = /^\[(\d{1,2})\]$/.exec(stueck);
        return treffer ? (
          <mark className="luecke" key={i}>
            {treffer[1]}
          </mark>
        ) : (
          <span key={i}>{stueck}</span>
        );
      })}
    </>
  );
}

function Lesetext({ text }: { text: PruefungsText }) {
  return (
    <article className="lesetext">
      {text.titel && (
        <h3>
          {text.buchstabe && (
            <span className="lesetext__buchstabe">{text.buchstabe}</span>
          )}
          {text.titel}
        </h3>
      )}
      {text.quelle && <p className="lesetext__quelle">{text.quelle}</p>}
      {text.inhalt.split('\n\n').map((absatz, i) => (
        <p key={i}>
          {absatz.split('\n').map((zeile, j, alle) => (
            <span key={j}>
              <AbsatzMitLuecken absatz={zeile} />
              {j < alle.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </article>
  );
}

function TeilAnsicht({
  teil,
  stufe,
  antworten,
  onAntwort,
  abgelaufen,
}: {
  teil: LesenTeil;
  stufe: Stufe;
  antworten: Record<string, string>;
  onAntwort: (nr: number, wert: string) => void;
  abgelaufen: boolean;
}) {
  const beantwortet = teil.items.filter((i) => antworten[String(i.nr)]).length;

  // Every task whose answers are letters takes them from the Teil: the B2
  // matching tasks from their option list, the small ads from the ads
  // themselves plus the level's marker for "none of these fits".
  const ohneTreffer = STUFEN[stufe].ohneTreffer;
  const buchstaben =
    teil.optionenliste?.map((o) => o.buchstabe) ??
    (teil.anzeigen
      ? [...teil.anzeigen.map((a) => a.buchstabe), ...(ohneTreffer ? [ohneTreffer] : [])]
      : undefined);

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
        <Lesetext key={t.id} text={t} />
      ))}

      {/* The lettered alternatives come before the items when they are what the
          candidate reads (the opinions of Teil 4) and after the text otherwise,
          which is how the printed paper sets them. Either way they precede the
          questions, because you cannot answer one without having read them. */}
      {teil.optionenliste && (
        <div className="optionenliste">
          {teil.optionenliste.map((o) => (
            <article className="optionenliste__eintrag" key={o.buchstabe}>
              <h4>
                <span className="optionenliste__buchstabe">{o.buchstabe}</span>
                {o.titel}
              </h4>
              <p>{o.inhalt}</p>
            </article>
          ))}
        </div>
      )}

      {teil.beispiel && <BeispielItem beispiel={teil.beispiel} />}

      <div className="items">
        {teil.items.map((item) => (
          <Item
            key={item.nr}
            item={item}
            wert={antworten[String(item.nr)]}
            onChange={(wert) => onAntwort(item.nr, wert)}
            disabled={abgelaufen}
            buchstaben={buchstaben}
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
