import { createPrivateKey, createPublicKey, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addReader,
  bytes32ToPublicKey,
  decryptDocument,
  deriveEncryptionKey,
  encryptDocument,
  hex,
  publicKeyToBytes32,
  revokeReader,
  shred,
} from "../src/index.ts";

const prf = (n: number) => new Uint8Array(32).fill(n);
const text = (s: string) => new TextEncoder().encode(s);
const read = (b: Uint8Array) => new TextDecoder().decode(b);

describe("key derivation (DR-1)", () => {
  it("is deterministic per passkey and distinct across passkeys", () => {
    expect(hex(deriveEncryptionKey(prf(1)).publicKey)).toBe(hex(deriveEncryptionKey(prf(1)).publicKey));
    expect(hex(deriveEncryptionKey(prf(1)).publicKey)).not.toBe(hex(deriveEncryptionKey(prf(2)).publicKey));
  });

  it("matches an independent HKDF + X25519 implementation (Node crypto)", () => {
    const ikm = prf(7);
    const sk = new Uint8Array(hkdfSync("sha256", ikm, "plenum", "plenum/x25519/v1", 32));
    const d = Buffer.from(sk).toString("base64url");
    const priv = createPrivateKey({ key: { kty: "OKP", crv: "X25519", d, x: "" } as never, format: "jwk" });
    const x = createPublicKey(priv).export({ format: "jwk" }).x!;
    const ours = deriveEncryptionKey(ikm);
    expect(hex(ours.privateKey)).toBe(hex(sk));
    expect(Buffer.from(ours.publicKey).toString("base64url")).toBe(x);
  });

  it("rejects PRF output of the wrong length", () => {
    expect(() => deriveEncryptionKey(new Uint8Array(31))).toThrow();
  });

  it("round-trips the onchain bytes32 encoding", () => {
    const { publicKey } = deriveEncryptionKey(prf(3));
    expect(hex(bytes32ToPublicKey(publicKeyToBytes32(publicKey)))).toBe(hex(publicKey));
  });
});

describe("envelope encryption (DR-2)", () => {
  const ana = deriveEncryptionKey(prf(10));
  const jonas = deriveEncryptionKey(prf(11));
  const manager = deriveEncryptionKey(prf(99));

  it("every listed reader can decrypt; nobody else can", async () => {
    const env = await encryptDocument("mandate-v1", text("Balanced: 45/20/15/20"), [ana.publicKey, jonas.publicKey]);
    expect(JSON.stringify(env)).not.toContain("Balanced");
    expect(read(await decryptDocument(env, ana))).toBe("Balanced: 45/20/15/20");
    expect(read(await decryptDocument(env, jonas))).toBe("Balanced: 45/20/15/20");
    await expect(decryptDocument(env, manager)).rejects.toThrow(/not a reader/);
  });

  it("detects tampering and document swaps", async () => {
    const env = await encryptDocument("risk-ana", text("horizon 5y"), [ana.publicKey]);
    const ct = atob(env.ct);
    const flipped = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 1) + ct.slice(1));
    await expect(decryptDocument({ ...env, ct: flipped }, ana)).rejects.toThrow();
    await expect(decryptDocument({ ...env, docId: "risk-other" }, ana)).rejects.toThrow();
  });
});

describe("consent, revocation, erasure (DR-3, DR-4)", () => {
  const tunde = deriveEncryptionKey(prf(20));
  const manager = deriveEncryptionKey(prf(99));

  it("grant: the member wraps the key to the manager, who can then read", async () => {
    const env = await encryptDocument("risk-tunde", text("moderate risk; needs liquidity in 2027"), [tunde.publicKey]);
    await expect(decryptDocument(env, manager)).rejects.toThrow();
    const shared = await addReader(env, tunde, manager.publicKey);
    expect(read(await decryptDocument(shared, manager))).toContain("moderate risk");
  });

  it("revoke: the manager loses access and the data key is rotated", async () => {
    const env = await encryptDocument("risk-tunde", text("secret"), [tunde.publicKey]);
    const shared = await addReader(env, tunde, manager.publicKey);
    const revoked = await revokeReader(shared, tunde, manager.publicKey);
    await expect(decryptDocument(revoked, manager)).rejects.toThrow(/not a reader/);
    expect(revoked.ct).not.toBe(shared.ct); // fresh data key and IV
    expect(read(await decryptDocument(revoked, tunde))).toBe("secret");
  });

  it("shred: with no wrapped keys nobody can decrypt", async () => {
    const env = await encryptDocument("old", text("x"), [tunde.publicKey]);
    await expect(decryptDocument(shred(env), tunde)).rejects.toThrow(/not a reader/);
  });
});
