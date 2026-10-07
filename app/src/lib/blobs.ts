"use client";

import type { Envelope } from "@plenum/crypto";
import type { LocalAccount } from "viem";
import { blobMessage } from "./blobProtocol";

export { profileDocId, riskDocId } from "./blobProtocol";

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function putBlob(account: LocalAccount, id: string, env: Envelope): Promise<void> {
  const body = JSON.stringify(env);
  const at = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: blobMessage(id, "PUT", await sha256Hex(body), at) });
  const res = await fetch(`/api/blobs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-plenum-signer": account.address, "x-plenum-signature": signature, "x-plenum-at": String(at) },
    body,
  });
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
}

export async function getBlob(id: string): Promise<Envelope | undefined> {
  const res = await fetch(`/api/blobs/${encodeURIComponent(id)}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return (await res.json()) as Envelope;
}

export async function deleteBlob(account: LocalAccount, id: string): Promise<void> {
  const at = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: blobMessage(id, "DELETE", "-", at) });
  const res = await fetch(`/api/blobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-plenum-signer": account.address, "x-plenum-signature": signature, "x-plenum-at": String(at) },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status}`);
}
