/**
 * Local persistence for an attempt.
 *
 * IndexedDB rather than localStorage for one reason: speaking recordings are
 * Blobs of several megabytes, and localStorage only stores strings and caps
 * out around 5 MB. IndexedDB stores Blobs natively.
 *
 * Nothing here ever leaves the device. See docs/PRIVACY.md.
 */

const DB_NAME = 'b1-pruefungstrainer';
const DB_VERSION = 1;
const STORE = 'versuche';

let handle: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (handle) return handle;
  handle = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('examId', 'examId');
        store.createIndex('gestartet', 'gestartet');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return handle;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export interface GespeicherterVersuch {
  id: string;
  examId: string;
  name: string;
  gestartet: string;
  abgegeben?: string;
  module: string[];
  antworten: { lesen: Record<string, string>; hoeren: Record<string, string> };
  schreiben: Record<string, string>;
  sprechen: Record<string, Blob>;
  /** Listening parts already played. A part may never be replayed. */
  gehoerteTeile: number[];
  ergebnis?: unknown;
}

export function neuerVersuch(
  examId: string,
  name: string,
  module: string[],
): GespeicherterVersuch {
  return {
    // crypto.randomUUID needs a secure context; the app already requires one
    // for the microphone, but fall back so the written modules still work.
    id: globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    examId,
    name,
    gestartet: new Date().toISOString(),
    module,
    antworten: { lesen: {}, hoeren: {} },
    schreiben: {},
    sprechen: {},
    gehoerteTeile: [],
  };
}

export const speichern = (v: GespeicherterVersuch): Promise<IDBValidKey> =>
  run('readwrite', (s) => s.put(v));

export const laden = (id: string): Promise<GespeicherterVersuch | undefined> =>
  run('readonly', (s) => s.get(id) as IDBRequest<GespeicherterVersuch | undefined>);

export const alleVersuche = (): Promise<GespeicherterVersuch[]> =>
  run('readonly', (s) => s.getAll() as IDBRequest<GespeicherterVersuch[]>).then((all) =>
    all.sort((a, b) => b.gestartet.localeCompare(a.gestartet)),
  );

export const loeschen = (id: string): Promise<undefined> =>
  run('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);

export async function allesLoeschen(): Promise<void> {
  await run('readwrite', (s) => s.clear() as IDBRequest<undefined>);
  if ('caches' in globalThis) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
