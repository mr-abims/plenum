import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";
import { BlobNotFoundError, del, get, put } from "@vercel/blob";

/**
 * Ciphertext-only blob storage. Cloudflare R2 when configured, else Vercel Blob (private store), else a local folder
 * (DEV FALLBACK, never on Vercel).
 */
export interface BlobStore {
  readonly kind: "r2" | "vercel-blob" | "local-dev-fallback" | "unconfigured";
  get(id: string): Promise<string | undefined>;
  put(id: string, body: string): Promise<void>;
  delete(id: string): Promise<void>;
}

class R2Store implements BlobStore {
  readonly kind = "r2" as const;
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    this.base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  }

  async get(id: string) {
    const res = await this.client.fetch(`${this.base}/${id}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`R2 get ${res.status}`);
    return res.text();
  }

  async put(id: string, body: string) {
    const res = await this.client.fetch(`${this.base}/${id}`, {
      method: "PUT",
      body,
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`R2 put ${res.status}`);
  }

  async delete(id: string) {
    const res = await this.client.fetch(`${this.base}/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete ${res.status}`);
  }
}

/**
 * Vercel Blob, private access: blobs are only reachable through this API with the store's token
 * (BLOB_READ_WRITE_TOKEN, added by Vercel when a Blob store is connected). Reads bypass the CDN cache so a
 * re-encrypted or erased document is never served stale.
 */
class VercelBlobStore implements BlobStore {
  readonly kind = "vercel-blob" as const;
  private path = (id: string) => `plenum/${id}.json`;

  async get(id: string) {
    const res = await get(this.path(id), { access: "private", useCache: false }).catch((err: unknown) => {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    });
    if (!res || res.statusCode !== 200) return undefined;
    return new Response(res.stream).text();
  }

  async put(id: string, body: string) {
    await put(this.path(id), body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  }

  async delete(id: string) {
    await del(this.path(id)).catch((err: unknown) => {
      if (!(err instanceof BlobNotFoundError)) throw err;
    });
  }
}

/** DEV FALLBACK: local files under .blobs/ — never used when R2 credentials are present. */
class LocalStore implements BlobStore {
  readonly kind = "local-dev-fallback" as const;
  private readonly dir = join(process.cwd(), ".blobs");

  async get(id: string) {
    try {
      return await readFile(join(this.dir, `${id}.json`), "utf8");
    } catch {
      return undefined;
    }
  }

  async put(id: string, body: string) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${id}.json`), body);
  }

  async delete(id: string) {
    await rm(join(this.dir, `${id}.json`), { force: true });
  }
}

/** On hosted deployments (Vercel) the filesystem is read-only and per-instance, so Vercel Blob or R2 is required. */
export class StorageNotConfigured extends Error {}
class UnconfiguredStore implements BlobStore {
  readonly kind = "unconfigured" as const;
  private fail(): never {
    throw new StorageNotConfigured("data-room storage is not configured: connect a Vercel Blob store (BLOB_READ_WRITE_TOKEN) or set R2_*");
  }
  async get(): Promise<string | undefined> {
    this.fail();
  }
  async put(): Promise<void> {
    this.fail();
  }
  async delete(): Promise<void> {
    this.fail();
  }
}

let store: BlobStore | undefined;
export function blobStore(): BlobStore {
  if (store) return store;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  store =
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET
      ? new R2Store(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)
      : process.env.BLOB_READ_WRITE_TOKEN
        ? new VercelBlobStore()
        : process.env.VERCEL
          ? new UnconfiguredStore()
          : new LocalStore();
  return store;
}
