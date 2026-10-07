/**
 * Plenum data-room cryptography (SPEC §10). Runs in the browser (members) and in Node (the manager runtime).
 *
 * - Encryption key: HKDF-SHA256(ikm = passkey PRF output, salt = "plenum", info = "plenum/x25519/v1") → X25519.
 *   The PRF output never leaves the client and is never stored.
 * - Documents: a random 256-bit data key per document, AES-256-GCM.
 * - Readers: the data key is wrapped per reader with HPKE (RFC 9180, DHKEM-X25519 / HKDF-SHA256 / AES-256-GCM).
 * - Consent: add the manager as a reader; revocation removes the wrapped key and rotates the data key;
 *   erasure (crypto-shredding) deletes every wrapped key.
 */
import { Aes256Gcm, CipherSuite, DhkemX25519HkdfSha256, HkdfSha256 } from "@hpke/core";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const HKDF_SALT = "plenum";
export const HKDF_INFO = "plenum/x25519/v1";
export const ALG = "A256GCM+HPKE(X25519,HKDF-SHA256,A256GCM)" as const;

const utf8 = (s: string) => new TextEncoder().encode(s);
const suite = new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes256Gcm() });
const subtle = globalThis.crypto.subtle;

export interface EncryptionKeyPair {
  privateKey: Uint8Array; // 32 bytes, keep in memory only
  publicKey: Uint8Array; // 32 bytes, published as `encPubKey` when joining a plenum
}

/** Derives the member's data-room key pair from the 32-byte passkey PRF output. Deterministic per passkey. */
export function deriveEncryptionKey(prfOutput: Uint8Array): EncryptionKeyPair {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  const privateKey = hkdf(sha256, prfOutput, utf8(HKDF_SALT), utf8(HKDF_INFO), 32);
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

export interface WrappedKey {
  enc: string; // HPKE encapsulated key, base64
  wrapped: string; // HPKE-sealed data key, base64
}

/** What the blob store holds. No plaintext, no keys in the clear. */
export interface Envelope {
  v: 1;
  alg: typeof ALG;
  docId: string; // bound into every AEAD as associated data
  iv: string;
  ct: string;
  recipients: Record<string, WrappedKey>; // reader X25519 public key (hex) → wrapped data key
}

export async function encryptDocument(docId: string, plaintext: Uint8Array, readers: Uint8Array[]): Promise<Envelope> {
  if (readers.length === 0) throw new Error("a document needs at least one reader");
  const dataKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(docId) }, key, own(plaintext)),
  );
  const env: Envelope = { v: 1, alg: ALG, docId, iv: b64(iv), ct: b64(ct), recipients: {} };
  for (const reader of readers) env.recipients[hex(reader)] = await wrap(docId, dataKey, reader);
  dataKey.fill(0);
  return env;
}

export async function decryptDocument(env: Envelope, me: EncryptionKeyPair): Promise<Uint8Array> {
  const dataKey = await unwrap(env, me);
  try {
    const key = await subtle.importKey("raw", own(dataKey), "AES-GCM", false, ["decrypt"]);
    const pt = await subtle.decrypt(
      { name: "AES-GCM", iv: own(unb64(env.iv)), additionalData: utf8(env.docId) },
      key,
      own(unb64(env.ct)),
    );
    return new Uint8Array(pt);
  } finally {
    dataKey.fill(0);
  }
}

/** Consent grant: an existing reader wraps the document key to a new reader (e.g. the manager). */
export async function addReader(env: Envelope, me: EncryptionKeyPair, reader: Uint8Array): Promise<Envelope> {
  const dataKey = await unwrap(env, me);
  try {
    return { ...env, recipients: { ...env.recipients, [hex(reader)]: await wrap(env.docId, dataKey, reader) } };
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Revocation (SPEC §10 step 5): drop the reader's wrapped key and re-encrypt under a fresh data key for the
 * remaining readers. Anything the reader already decrypted stays read.
 */
export async function revokeReader(env: Envelope, me: EncryptionKeyPair, reader: Uint8Array): Promise<Envelope> {
  const plaintext = await decryptDocument(env, me);
  const remaining = Object.keys(env.recipients)
    .filter((k) => k !== hex(reader))
    .map(fromHex);
  return encryptDocument(env.docId, plaintext, remaining);
}

/** Erasure by crypto-shredding: without wrapped keys the ciphertext cannot be opened by anyone. */
export function shred(env: Envelope): Envelope {
  return { ...env, recipients: {} };
}

/** `encPubKey` as published onchain (bytes32 hex). */
export function publicKeyToBytes32(publicKey: Uint8Array): `0x${string}` {
  if (publicKey.length !== 32) throw new Error("X25519 public key must be 32 bytes");
  return `0x${hex(publicKey)}`;
}

export function bytes32ToPublicKey(value: string): Uint8Array {
  return fromHex(value.replace(/^0x/, ""));
}

// ------------------------------------------------------------------ helpers

async function wrap(docId: string, dataKey: Uint8Array, reader: Uint8Array): Promise<WrappedKey> {
  const recipientPublicKey = await suite.kem.deserializePublicKey(reader);
  const { ct, enc } = await suite.seal({ recipientPublicKey, info: utf8(`plenum/doc/${docId}`) }, dataKey);
  return { enc: b64(new Uint8Array(enc)), wrapped: b64(new Uint8Array(ct)) };
}

async function unwrap(env: Envelope, me: EncryptionKeyPair): Promise<Uint8Array> {
  const entry = env.recipients[hex(me.publicKey)];
  if (!entry) throw new Error("not a reader of this document");
  const recipientKey = await suite.kem.importKey("raw", me.privateKey.slice().buffer, false);
  const pt = await suite.open(
    { recipientKey, enc: unb64(entry.enc), info: utf8(`plenum/doc/${env.docId}`) },
    unb64(entry.wrapped),
  );
  return new Uint8Array(pt);
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) throw new Error("invalid hex");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Copy into an ArrayBuffer-backed view (WebCrypto rejects SharedArrayBuffer-backed input). */
function own(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

// ------------------------------------------------------------ storage protocol

/**
 * Data-room storage protocol shared by the app (members), the blob API and the manager runtime.
 * Blob ids are public and end with the owner's address; only that address may write or delete them, and every
 * write is signed over this message. Contents are always an encrypted Envelope.
 */
export function blobMessage(id: string, method: "PUT" | "DELETE", bodyHash: string, at: number) {
  return `Plenum data room\n${method} ${id}\nbody ${bodyHash}\nat ${at}`;
}

const tag = (plenum: string) => plenum.toLowerCase().slice(2, 10);

/** A member's risk questionnaire for one plenum (owner: the member). */
export const riskDocId = (plenum: string, member: string) => `risk-${tag(plenum)}-${member.toLowerCase()}`;
/** A member's private profile (owner: the member). */
export const profileDocId = (member: string) => `profile-${member.toLowerCase()}`;
/** A manager memo, keyed by its committed rationale hash (owner: the manager operator key). */
export const memoDocId = (rationaleHash: string, manager: string) =>
  `memo-${rationaleHash.toLowerCase().slice(2, 18)}-${manager.toLowerCase()}`;

/** Canonical JSON (sorted keys, no whitespace). keccak256 of this is the rationale hash committed onchain. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
