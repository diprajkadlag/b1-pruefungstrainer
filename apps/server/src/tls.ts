/**
 * Self-signed certificate for LAN use.
 *
 * Browsers refuse microphone access on a plain http:// origin unless it is
 * localhost. Practising the speaking module on a phone therefore needs TLS,
 * and for a home network a self-signed certificate is the proportionate
 * answer — the browser will warn once and then remember the exception.
 *
 * Generated with Node's own crypto, so nothing extra has to be installed.
 * The key never leaves the machine and is regenerated if it is deleted.
 */

import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERZEICHNIS = join(dirname(fileURLToPath(import.meta.url)), '..', '.tls');
const KEY = join(VERZEICHNIS, 'server.key');
const CERT = join(VERZEICHNIS, 'server.crt');

export async function selbstsigniertesZertifikat(): Promise<{
  key: string;
  cert: string;
}> {
  if (existsSync(KEY) && existsSync(CERT)) {
    return {
      key: await readFile(KEY, 'utf-8'),
      cert: await readFile(CERT, 'utf-8'),
    };
  }

  await mkdir(VERZEICHNIS, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const cert = zertifikatBauen(privateKey, publicKey);
  await writeFile(KEY, privateKey, { mode: 0o600 });
  await writeFile(CERT, cert, { mode: 0o600 });

  console.log(
    `\n  Selbstsigniertes Zertifikat erzeugt: ${VERZEICHNIS}\n` +
      `  Der Browser wird einmal warnen — das ist bei einem eigenen Zertifikat normal.`,
  );
  return { key: privateKey, cert };
}

/**
 * Minimal X.509 v3 builder.
 *
 * Node has no certificate API, and pulling in a PKI library for a home-network
 * convenience is not worth the dependency. This writes just enough DER for a
 * browser to accept the connection after the user confirms the exception.
 */
function zertifikatBauen(privateKey: string, publicKeyPem: string): string {
  const jetzt = new Date();
  const bis = new Date(jetzt.getTime() + 825 * 24 * 3600 * 1000); // browser max

  const spki = derAusPem(publicKeyPem);
  const seriennummer = Buffer.concat([Buffer.from([0x00]), randomBytes(8)]);

  const algorithmus = seq(oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00])); // sha256WithRSA
  const name = seq(
    set(seq(oid('2.5.4.3'), utf8('b1-pruefungstrainer local'))),
    set(seq(oid('2.5.4.10'), utf8('b1-pruefungstrainer'))),
  );

  const gueltigkeit = seq(utcZeit(jetzt), utcZeit(bis));

  // Accept any name a home network might use to reach the machine.
  const altNamen = tag(
    0xa3,
    seq(
      seq(
        oid('2.5.29.17'),
        octet(
          seq(
            tag(0x82, Buffer.from('localhost')),
            tag(0x87, Buffer.from([127, 0, 0, 1])),
            ...lokaleAdressen().map((ip) => tag(0x87, Buffer.from(ip))),
          ),
        ),
      ),
      seq(oid('2.5.29.19'), octet(seq())), // basicConstraints: CA false
    ),
  );

  const tbs = seq(
    tag(0xa0, int(Buffer.from([0x02]))), // version 3
    int(seriennummer),
    algorithmus,
    name,
    gueltigkeit,
    name,
    spki,
    altNamen,
  );

  const signatur = createSign('sha256').update(tbs).sign(privateKey);
  const zertifikat = seq(tbs, algorithmus, bitString(signatur));

  return (
    '-----BEGIN CERTIFICATE-----\n' +
    (zertifikat.toString('base64').match(/.{1,64}/g) ?? []).join('\n') +
    '\n-----END CERTIFICATE-----\n'
  );
}

function lokaleAdressen(): number[][] {
  const out: number[][] = [];
  for (const netz of Object.values(networkInterfaces())) {
    for (const adresse of netz ?? []) {
      if (adresse.family === 'IPv4' && !adresse.internal) {
        out.push(adresse.address.split('.').map(Number));
      }
    }
  }
  return out;
}

// --- tiny DER encoder ------------------------------------------------------

function laenge(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (typ: number, inhalt: Buffer): Buffer =>
  Buffer.concat([Buffer.from([typ]), laenge(inhalt.length), inhalt]);

const seq = (...teile: Buffer[]): Buffer => tlv(0x30, Buffer.concat(teile));
const set = (...teile: Buffer[]): Buffer => tlv(0x31, Buffer.concat(teile));
const tag = (typ: number, inhalt: Buffer): Buffer => tlv(typ, inhalt);
const int = (b: Buffer): Buffer => tlv(0x02, b);
const octet = (b: Buffer): Buffer => tlv(0x04, b);
const utf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, 'utf-8'));
const bitString = (b: Buffer): Buffer => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));

function oid(punkte: string): Buffer {
  const teile = punkte.split('.').map(Number);
  const bytes = [teile[0]! * 40 + teile[1]!];
  for (const wert of teile.slice(2)) {
    const stack: number[] = [wert & 0x7f];
    for (let v = wert >>> 7; v > 0; v >>>= 7) stack.unshift((v & 0x7f) | 0x80);
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function utcZeit(d: Date): Buffer {
  const zwei = (n: number) => String(n).padStart(2, '0');
  const s =
    zwei(d.getUTCFullYear() % 100) +
    zwei(d.getUTCMonth() + 1) +
    zwei(d.getUTCDate()) +
    zwei(d.getUTCHours()) +
    zwei(d.getUTCMinutes()) +
    zwei(d.getUTCSeconds()) +
    'Z';
  return tlv(0x17, Buffer.from(s, 'ascii'));
}

function derAusPem(pem: string): Buffer {
  const base64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}
