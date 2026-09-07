import type { LoggedViewing } from "../caldav/types";

// #335: a shareable, read-only snapshot has to fit in a URL, and every
// field it carries is one a recipient with no CalDAV/OMDb credentials at
// all gets to see — so this is deliberately a small, explicit allowlist
// of display fields (whatever the overview row already renders), not the
// full LoggedViewing. No credential, server URL, or API key ever has a
// field here to land in by accident.
export interface SharedViewing {
  uid: string;
  title: string;
  year?: string;
  start: string;
  end: string;
  medium: string;
  venue?: string;
  geo?: { lat: number; lon: number };
  posterUrl?: string;
  imdbId?: string;
  letterboxdUrl?: string;
}

export interface SharedState {
  sharedAt: string; // ISO 8601 — when this snapshot was taken, for the "frozen as of" notice
  viewings: SharedViewing[];
}

export function toSharedViewing(v: LoggedViewing): SharedViewing {
  const shared: SharedViewing = {
    uid: v.uid,
    title: v.title,
    start: v.start,
    end: v.end,
    medium: v.medium,
  };
  if (v.year) shared.year = v.year;
  if (v.venue) shared.venue = v.venue;
  if (v.geo) shared.geo = v.geo;
  if (v.posterUrl) shared.posterUrl = v.posterUrl;
  if (v.imdbId) shared.imdbId = v.imdbId;
  if (v.letterboxdUrl) shared.letterboxdUrl = v.letterboxdUrl;
  return shared;
}

// A generous but real ceiling — comfortably under what browsers/servers
// support, but small enough to still work when pasted into a chat app or
// an email, which is the actual point of a link. Checked against the
// finished URL (query param included), not just the encoded payload.
export const MAX_SHARE_URL_LENGTH = 6000;

// #335: pinned to the plain-ArrayBuffer-backed form throughout this
// file — a bare `Uint8Array` type-checks as `Uint8Array<ArrayBufferLike>`
// under this project's TypeScript version, which could in principle wrap
// a SharedArrayBuffer, and the DOM stream APIs below (BufferSource,
// ReadableStream's own generic) all require ruling that out explicitly.
// Every value that reaches these functions is freshly allocated a few
// lines up, so this is a type-system formality, not a real runtime
// concern.
type Bytes = Uint8Array<ArrayBuffer>;

function toBase64Url(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// A single-chunk ReadableStream, rather than Blob's own .stream() —
// Blob's constructor type doesn't accept a plain Uint8Array as a
// BlobPart under this project's TypeScript version, and this needs no
// Blob at all, just something CompressionStream/DecompressionStream can pipe.
function toStream(bytes: Bytes): ReadableStream<Bytes> {
  return new ReadableStream<Bytes>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// gzip via the browser's own CompressionStream — no bundled dependency,
// supported in every browser this app already targets (Chrome/Edge 80+,
// Firefox 113+, Safari 16.4+).
async function gzip(text: string): Promise<Bytes> {
  const stream = toStream(new TextEncoder().encode(text)).pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Bytes): Promise<string> {
  const stream = toStream(bytes).pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function encodeSharedState(state: SharedState): Promise<string> {
  const compressed = await gzip(JSON.stringify(state));
  return toBase64Url(compressed);
}

export async function decodeSharedState(encoded: string): Promise<SharedState> {
  const json = await gunzip(fromBase64Url(encoded));
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as SharedState).viewings) ||
    typeof (parsed as SharedState).sharedAt !== "string"
  ) {
    throw new Error("not a recognised shared link");
  }
  return parsed as SharedState;
}
