import type { AudioManifest, OeffentlichePruefung } from '@b1/core';
import { audioUrl } from '../lib/content';
import { BeispielItem, Item } from '../components/Item';
import { HoerPlayer } from '../components/HoerPlayer';

interface Props {
  pruefung: OeffentlichePruefung;
  manifest: AudioManifest | null;
  antworten: Record<string, string>;
  onAntwort: (nr: number, wert: string) => void;
  gehoerteTeile: number[];
  onGehoert: (teil: number) => void;
  abgelaufen: boolean;
}

export function Hoeren({
  pruefung,
  manifest,
  antworten,
  onAntwort,
  gehoerteTeile,
  onGehoert,
  abgelaufen,
}: Props) {
  return (
    <div className="modul">
      {!manifest && (
        <p className="fehler">
          Für diese Prüfung wurden noch keine Hörtexte erzeugt. Führen Sie
          <code> python tools/generate_audio.py </code> aus.
        </p>
      )}

      {pruefung.hoeren.teile.map((teil) => {
        const spur = manifest?.hoeren.find((h) => h.teil === teil.nummer);
        const gesperrt = gehoerteTeile.includes(teil.nummer);
        const beantwortet = teil.items.filter((i) => antworten[String(i.nr)]).length;

        return (
          <section className="teil" key={teil.nummer}>
            <header className="teil__kopf">
              <h2>Teil {teil.nummer}</h2>
              <span className="teil__meta">
                {beantwortet}/{teil.items.length} · {teil.wiederholungen}× hören
                {spur && ` · ${Math.round(spur.dauerSek / 60)} Min.`}
              </span>
            </header>
            <p className="teil__anweisung">{teil.anweisung}</p>
            {teil.situation && <p className="these">{teil.situation}</p>}

            {spur && (
              <HoerPlayer
                src={audioUrl(pruefung.meta.id, spur.datei)}
                teil={teil.nummer}
                gesperrt={gesperrt || abgelaufen}
                onStart={() => onGehoert(teil.nummer)}
                onEnde={() => undefined}
              />
            )}

            {/* Teil 4 maps a/b/c onto the three speakers, so name them. */}
            {teil.nummer === 4 && teil.sprecher && (
              <p className="sprecherliste">
                {teil.sprecher.map((s, i) => (
                  <span key={s.rolle}>
                    <strong>{'abc'[i]}</strong> {s.beschreibung ?? s.rolle}
                    {i < teil.sprecher!.length - 1 && ' · '}
                  </span>
                ))}
              </p>
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
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
