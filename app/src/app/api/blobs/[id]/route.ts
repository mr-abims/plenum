import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyMessage, isAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { blobMessage } from "@/lib/blobProtocol";
import { blobStore } from "@/lib/blobStore.server";

const MAX_BYTES = 256 * 1024;
const MAX_SKEW_SECONDS = 300;
// Ids end with the owner's address: only that address may write or delete the blob.
const ID = /^[a-z][a-z0-9-]{2,100}-0x[0-9a-f]{40}$/;

const EnvelopeSchema = z
  .object({
    v: z.literal(1),
    alg: z.string().max(80),
    docId: z.string().max(200),
    iv: z.string().max(64),
    ct: z.string().max(MAX_BYTES),
    recipients: z.record(z.string().regex(/^[0-9a-f]{64}$/), z.object({ enc: z.string().max(200), wrapped: z.string().max(200) }).strict()),
  })
  .strict();

type Ctx = { params: Promise<{ id: string }> };

async function authorize(req: Request, id: string, method: "PUT" | "DELETE", bodyHash: string) {
  const signer = req.headers.get("x-plenum-signer") ?? "";
  const signature = (req.headers.get("x-plenum-signature") ?? "") as Hex;
  const at = Number(req.headers.get("x-plenum-at"));
  if (!isAddress(signer) || !Number.isFinite(at)) return "missing signature headers";
  if (Math.abs(Date.now() / 1000 - at) > MAX_SKEW_SECONDS) return "signature expired";
  if (!id.endsWith(`-${signer.toLowerCase()}`)) return "only the owner can change this document";
  try {
    const ok = await verifyMessage({ address: signer as Address, message: blobMessage(id, method, bodyHash, at), signature });
    return ok ? undefined : "bad signature";
  } catch {
    return "bad signature"; // malformed signatures throw rather than returning false
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID.test(id)) return new NextResponse("bad id", { status: 400 });
  const body = await blobStore().get(id);
  if (body === undefined) return new NextResponse("not found", { status: 404 });
  return new NextResponse(body, { headers: { "content-type": "application/json", "x-plenum-store": blobStore().kind } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID.test(id)) return new NextResponse("bad id", { status: 400 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return new NextResponse("too large", { status: 413 });
  const parsed = EnvelopeSchema.safeParse(JSON.parse(text || "null"));
  if (!parsed.success) return new NextResponse("only encrypted envelopes are accepted", { status: 400 });
  const problem = await authorize(req, id, "PUT", createHash("sha256").update(text).digest("hex"));
  if (problem) return new NextResponse(problem, { status: 403 });
  await blobStore().put(id, text);
  return NextResponse.json({ ok: true, store: blobStore().kind });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID.test(id)) return new NextResponse("bad id", { status: 400 });
  const problem = await authorize(req, id, "DELETE", "-");
  if (problem) return new NextResponse(problem, { status: 403 });
  await blobStore().delete(id);
  return NextResponse.json({ ok: true });
}
