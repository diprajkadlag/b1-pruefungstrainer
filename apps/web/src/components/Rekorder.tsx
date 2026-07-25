import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** Hard stop, in seconds — the part's allotted time. */
  maxSekunden: number;
  vorhanden?: Blob;
  onFertig: (blob: Blob) => void;
}

/**
 * Microphone capture for one speaking part.
 *
 * MediaRecorder needs a secure context, so this works on localhost and over
 * HTTPS but not over plain http:// from another device on the network. That is
 * a browser rule, not a choice; the message below says so rather than failing
 * silently, and the README documents the self-signed-HTTPS workaround.
 */
export function Rekorder({ maxSekunden, vorhanden, onFertig }: Props) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stueck = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [sekunden, setSekunden] = useState(0);
  const [pegel, setPegel] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | undefined>(vorhanden);

  const unterstuetzt =
    typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const sicher = window.isSecureContext;

  const stoppen = useCallback(() => {
    recorder.current?.state === 'recording' && recorder.current.stop();
  }, []);

  useEffect(() => {
    if (!laeuft) return;
    const id = window.setInterval(() => {
      setSekunden((s) => {
        if (s + 1 >= maxSekunden) stoppen();
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [laeuft, maxSekunden, stoppen]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function starten() {
    setFehler(null);
    if (!sicher) {
      setFehler(
        'Aufnahme braucht eine sichere Verbindung. Öffnen Sie die App über ' +
          'http://localhost oder über HTTPS — über http://192.168.x.x sperrt der ' +
          'Browser das Mikrofon.',
      );
      return;
    }
    if (!unterstuetzt) {
      setFehler('Dieser Browser unterstützt keine Audioaufnahme.');
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current = s;

      // A level meter is not decoration: without it a candidate cannot tell a
      // muted microphone from a silent room until the recording is worthless.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const daten = new Uint8Array(analyser.frequencyBinCount);
      const messen = () => {
        if (!stream.current) return;
        analyser.getByteTimeDomainData(daten);
        let summe = 0;
        for (const v of daten) summe += (v - 128) ** 2;
        setPegel(Math.min(1, Math.sqrt(summe / daten.length) / 40));
        requestAnimationFrame(messen);
      };
      messen();

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      stueck.current = [];
      rec.ondataavailable = (e) => e.data.size && stueck.current.push(e.data);
      rec.onstop = () => {
        const fertig = new Blob(stueck.current, { type: rec.mimeType || 'audio/webm' });
        setBlob(fertig);
        onFertig(fertig);
        setLaeuft(false);
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setPegel(0);
        void ctx.close();
      };
      rec.start(1000);
      recorder.current = rec;
      setSekunden(0);
      setLaeuft(true);
    } catch (err) {
      setFehler(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Der Zugriff auf das Mikrofon wurde abgelehnt. Ohne Mikrofon können Sie ' +
            'die anderen Module trotzdem bearbeiten.'
          : 'Das Mikrofon konnte nicht gestartet werden.',
      );
    }
  }

  const rest = Math.max(0, maxSekunden - sekunden);

  return (
    <div className="rekorder">
      {!laeuft && (
        <button type="button" className="knopf knopf--gross" onClick={starten}>
          {blob ? '⏺ Neu aufnehmen' : '⏺ Aufnahme starten'}
        </button>
      )}

      {laeuft && (
        <div className="rekorder__lauf">
          <div className="rekorder__pegel" aria-hidden="true">
            <div className="rekorder__pegelbalken" style={{ width: `${pegel * 100}%` }} />
          </div>
          <span className="rekorder__zeit" role="timer">
            ● {String(Math.floor(rest / 60)).padStart(2, '0')}:
            {String(rest % 60).padStart(2, '0')}
          </span>
          <button type="button" className="knopf knopf--sekundaer" onClick={stoppen}>
            Aufnahme beenden
          </button>
        </div>
      )}

      {blob && !laeuft && (
        <div className="rekorder__fertig">
          <audio controls src={URL.createObjectURL(blob)} />
          <span className="notiz">
            Aufnahme gespeichert ({Math.round(blob.size / 1024)} KB). Sie bleibt auf
            diesem Gerät.
          </span>
        </div>
      )}

      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  );
}
