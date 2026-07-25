/**
 * Minimal ZIP writer, no dependencies.
 *
 * The candidate needs one file to hand to a teacher: writing plus recordings
 * plus the score report. Pulling in a compression library for that would be
 * disproportionate — the payload is almost entirely already-compressed audio,
 * which deflate cannot shrink. So entries are stored uncompressed (method 0),
 * which needs nothing beyond a CRC-32 and the archive headers.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array<ArrayBuffer>): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what the ZIP format still stores. */
function dosStamp(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEintrag {
  name: string;
  // Explicitly ArrayBuffer-backed: TypeScript 5.7 distinguishes those from
  // SharedArrayBuffer-backed views, and only the former may go into a Blob.
  data: Uint8Array<ArrayBuffer> | string;
}

export async function zipErstellen(eintraege: ZipEintrag[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const stamp = dosStamp(new Date());
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const eintrag of eintraege) {
    const nameBytes: Uint8Array<ArrayBuffer> = encoder.encode(eintrag.name);
    const body: Uint8Array<ArrayBuffer> =
      typeof eintrag.data === 'string' ? encoder.encode(eintrag.data) : eintrag.data;
    const crc = crc32(body);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filename flag
    local.setUint16(8, 0, true); // stored, no compression
    local.setUint16(10, stamp.time, true);
    local.setUint16(12, stamp.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, body.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const header = new Uint8Array(local.buffer);
    chunks.push(header, nameBytes, body);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory header
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, stamp.time, true);
    dir.setUint16(14, stamp.date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, body.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);

    const dirBytes = new Uint8Array(46 + nameBytes.length);
    dirBytes.set(new Uint8Array(dir.buffer), 0);
    dirBytes.set(nameBytes, 46);
    central.push(dirBytes);

    offset += header.length + nameBytes.length + body.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, eintraege.length, true);
  end.setUint16(10, eintraege.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/zip',
  });
}

export function herunterladen(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const blobZuBytes = async (blob: Blob): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await blob.arrayBuffer());
