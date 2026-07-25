import { useEffect, useState } from 'react';
import { registryLaden, type RegistryEintrag } from '../lib/content';
import { alleVersuche, loeschen, type GespeicherterVersuch } from '../lib/db';

export type ModulWahl = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen';

const MODULE: { id: ModulWahl; label: string; dauer: string }[] = [
  { id: 'lesen', label: 'Lesen', dauer: '65 Min.' },
  { id: 'hoeren', label: 'Hören', dauer: '40 Min.' },
  { id: 'schreiben', label: 'Schreiben', dauer: '60 Min.' },
  { id: 'sprechen', label: 'Sprechen', dauer: '15 Min. + 15 Min. Vorbereitung' },
];

interface Props {
  onStart: (examId: string, name: string, module: ModulWahl[]) => void;
  onWeiter: (versuchId: string) => void;
  onErgebnis: (versuchId: string) => void;
}

export function Start({ onStart, onWeiter, onErgebnis }: Props) {
  const [pruefungen, setPruefungen] = useState<RegistryEintrag[]>([]);
  const [versuche, setVersuche] = useState<GespeicherterVersuch[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [name, setName] = useState(localStorage.getItem('b1-name') ?? '');
  const [examId, setExamId] = useState('');
  const [module, setModule] = useState<ModulWahl[]>(['lesen', 'hoeren']);

  useEffect(() => {
    registryLaden()
      .then((r) => {
        setPruefungen(r.pruefungen);
        setExamId((cur) => cur || (r.pruefungen[0]?.id ?? ''));
      })
      .catch(() =>
        setFehler(
          'Die Prüfungen konnten nicht geladen werden. Wurde ' +
            '„python tools/export_web.py“ ausgeführt?',
        ),
      );
    void alleVersuche().then(setVersuche);
  }, []);

  const gewaehlt = pruefungen.find((p) => p.id === examId);

  function umschalten(id: ModulWahl) {
    setModule((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  function starten() {
    if (!examId || module.length === 0) return;
    localStorage.setItem('b1-name', name);
    onStart(
      examId,
      name,
      // Keep the official module order regardless of the click order.
      MODULE.filter((m) => module.includes(m.id)).map((m) => m.id),
    );
  }

  return (
    <div className="start">
      <section className="hinweis-box">
        <strong>Keine offizielle Prüfung.</strong> Dieses Übungsmaterial steht in keiner
        Verbindung zum Goethe-Institut e.&nbsp;V., zur telc gGmbH oder zum ÖSD. Alle
        Texte und Aufgaben sind eigens für dieses Projekt verfasst.
      </section>

      {fehler && <p className="fehler">{fehler}</p>}

      {versuche.some((v) => !v.abgegeben) && (
        <section className="teil">
          <h2>Nicht abgeschlossene Versuche</h2>
          {versuche
            .filter((v) => !v.abgegeben)
            .map((v) => (
              <div className="versuchszeile" key={v.id}>
                <span>
                  {v.examId} · {new Date(v.gestartet).toLocaleString('de-DE')} ·{' '}
                  {v.module.join(', ')}
                </span>
                <span className="versuchszeile__knoepfe">
                  <button type="button" className="knopf" onClick={() => onWeiter(v.id)}>
                    Fortsetzen
                  </button>
                  <button
                    type="button"
                    className="knopf knopf--sekundaer"
                    onClick={() => void loeschen(v.id).then(() => alleVersuche().then(setVersuche))}
                  >
                    Löschen
                  </button>
                </span>
              </div>
            ))}
        </section>
      )}

      {versuche.some((v) => v.abgegeben) && (
        <section className="teil">
          <h2>Frühere Ergebnisse</h2>
          {versuche
            .filter((v) => v.abgegeben)
            .slice(0, 8)
            .map((v) => (
              <div className="versuchszeile" key={v.id}>
                <span>
                  {v.examId} · {new Date(v.gestartet).toLocaleDateString('de-DE')} ·{' '}
                  {v.module.join(', ')}
                </span>
                <button type="button" className="knopf" onClick={() => onErgebnis(v.id)}>
                  Ergebnis ansehen
                </button>
              </div>
            ))}
        </section>
      )}

      <section className="teil">
        <h2>Neue Prüfung beginnen</h2>

        <label className="feld">
          <span>Name (nur für Ihre Abgabe, bleibt auf diesem Gerät)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Ravi"
          />
        </label>

        <div className="pruefungswahl">
          {pruefungen.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`pruefungskarte ${examId === p.id ? 'pruefungskarte--aktiv' : ''}`}
              onClick={() => setExamId(p.id)}
              aria-pressed={examId === p.id}
            >
              <strong>{p.titel}</strong>
              <span className="pruefungskarte__meta">
                Niveau {p.niveau} · {p.variante}
                {p.hatAudio && ` · ${Math.round(p.audioDauerSek / 60)} Min. Audio`}
              </span>
              <span className="pruefungskarte__themen">{p.themen.join(' · ')}</span>
            </button>
          ))}
        </div>

        <fieldset className="modulwahl">
          <legend>Welche Module möchten Sie ablegen?</legend>
          {MODULE.map((m) => (
            <label
              key={m.id}
              className={`modulkarte ${module.includes(m.id) ? 'modulkarte--aktiv' : ''}`}
            >
              <input
                type="checkbox"
                checked={module.includes(m.id)}
                onChange={() => umschalten(m.id)}
              />
              <span className="modulkarte__name">{m.label}</span>
              <span className="modulkarte__dauer">{m.dauer}</span>
            </label>
          ))}
        </fieldset>

        {module.includes('sprechen') && !window.isSecureContext && (
          <p className="fehler">
            Für das Modul Sprechen braucht der Browser eine sichere Verbindung. Über
            <code> http://localhost </code> funktioniert es; über eine IP-Adresse im
            Netzwerk sperrt der Browser das Mikrofon.
          </p>
        )}

        <button
          type="button"
          className="knopf knopf--gross knopf--primaer"
          disabled={!examId || module.length === 0}
          onClick={starten}
        >
          Prüfung starten
          {gewaehlt && module.length > 0 && (
            <span className="knopf__zusatz">
              {' '}
              — {module.length} Modul{module.length > 1 ? 'e' : ''}
            </span>
          )}
        </button>

        <p className="notiz">
          Der Timer läuft ab dem Start und lässt sich nicht anhalten. Ihre Antworten
          werden laufend auf diesem Gerät gespeichert — ein Neuladen verliert nichts.
        </p>
      </section>
    </div>
  );
}
