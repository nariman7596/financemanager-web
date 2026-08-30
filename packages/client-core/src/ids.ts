// ---------------------------------------------------------------------------
// UUIDv7 — time-ordered ids the CLIENT generates.
//
// Offline creation requires an id before the server has seen the row, so the
// client mints it. v7 rather than v4 because the first 48 bits are a
// millisecond timestamp: ids sort in creation order, which keeps the sync
// cursor's (revision, id) ordering stable and gives the database sensible
// index locality instead of scattering every insert across the B-tree.
// ---------------------------------------------------------------------------

/**
 * Random bytes. `globalThis.crypto` exists in browsers, in Node 19+, and in
 * Expo once `react-native-get-random-values` is imported — which the mobile app
 * must do at its entry point, before anything calls this.
 */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!webcrypto?.getRandomValues) {
    throw new Error(
      "No crypto.getRandomValues available. In Expo, import " +
        "'react-native-get-random-values' at the app entry point.",
    );
  }
  webcrypto.getRandomValues(bytes);
  return bytes;
}

const hex = (n: number) => n.toString(16).padStart(2, "0");

/** A UUIDv7 string. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);

  // 48-bit big-endian timestamp.
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const s = Array.from(bytes, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Compare two revision strings. They are BigInts on the wire as strings,
 *  because above 2^53 a JSON number silently loses precision. */
export function revisionGreater(a: string, b: string): boolean {
  return BigInt(a || "0") > BigInt(b || "0");
}
