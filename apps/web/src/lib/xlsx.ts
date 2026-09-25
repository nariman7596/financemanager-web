import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * The files inside an .xlsx (a zip) that a sheet needs: the first worksheet
 * and the shared strings. Just enough of the zip format — central directory,
 * stored or deflated entries — to avoid a spreadsheet library for one import.
 */
export function readXlsx(buf: Buffer): { sheet: string; shared: string | null } | null {
  const files = unzip(buf, (name) => name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!files) return null;
  const sheetName = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) return null;
  return { sheet: files.get(sheetName)!, shared: files.get("xl/sharedStrings.xml") ?? null };
}

function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, string> | null {
  // End of central directory: the last "PK\x05\x06" record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) out.set(name, data.toString("utf8"));
    else if (method === 8) out.set(name, inflateRawSync(data).toString("utf8"));
    else return null;
  }
  return out;
}
