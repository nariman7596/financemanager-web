// Minimal, correct CSV parse/serialize (RFC 4180-ish).
// Handles quoted fields, embedded commas/newlines, and "" escaped quotes.
// No external dependency.

/** Serialize a field, quoting only when needed. */
function encodeField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize arbitrary (possibly jagged) rows to CSV. */
export function serializeCsv(
  rows: (string | number | null | undefined)[][],
): string {
  return rows.map((row) => row.map(encodeField).join(",")).join("\r\n");
}

/** Build a CSV string from a header + rows. */
export function toCsv(
  header: string[],
  rows: (string | number | null | undefined)[][],
): string {
  return serializeCsv([header, ...rows]);
}

/** Parse CSV text into an array of rows (each a string[]). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // handle CRLF: skip the \n after \r
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // flush trailing field/row (unless the input ended exactly on a newline)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV into objects keyed by lowercased header names.
 * Blank rows are dropped.
 */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}
