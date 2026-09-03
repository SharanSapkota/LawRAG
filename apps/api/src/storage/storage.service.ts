import { Injectable } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

export interface UploadFileInput {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  // Defaults to "chat-attachments" to preserve the existing chat upload
  // behavior unchanged; callers outside chat (e.g. the documents module)
  // pass their own.
  keyPrefix?: string;
}

export interface UploadFileResult {
  key: string;
  url: string;
}

/**
 * Wraps @aws-sdk/client-s3 pointed at Cloudflare R2 (S3-compatible). All
 * R2/S3-specific code is isolated here — nothing else in the codebase
 * should import @aws-sdk/client-s3 directly. Only the resulting key/URL is
 * ever persisted to Postgres; the binary never touches the database.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME as string;
    this.endpoint = process.env.R2_ENDPOINT as string;
    this.client = new S3Client({
      region: "auto",
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const prefix = input.keyPrefix ?? "chat-attachments";
    const key = `${prefix}/${randomUUID()}-${input.fileName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType,
      }),
    );

    return { key, url: this.getFileUrl(key) };
  }

  async downloadFile(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const byteArray = await response.Body?.transformToByteArray();

    if (!byteArray) {
      throw new Error(`Failed to download object "${key}" from R2 — empty response body`);
    }

    return Buffer.from(byteArray);
  }

  getFileUrl(key: string): string {
    // R2 objects aren't publicly readable via this endpoint by default —
    // this identifies where the object lives, not a fetchable public URL.
    // Serving it (public bucket dev URL, custom domain, or a presigned GET)
    // is production file-storage config (CLAUDE.md open decision O2), out
    // of scope here.
    return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key}`;
  }

  /**
   * Reverses getFileUrl() to recover the R2 key from a stored fileUrl —
   * needed because LawDocument only persists the URL (CLAUDE.md: no
   * binary storage, URL/key only), not a separate key column. This is a
   * bit fragile (breaks if the URL format ever changes) — a cleaner
   * design would store the key in its own DB column, but that's a schema
   * change outside this task's scope.
   */
  extractKeyFromUrl(url: string): string {
    const prefix = `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/`;

    if (!url.startsWith(prefix)) {
      throw new Error(`URL "${url}" does not match this StorageService's endpoint/bucket`);
    }

    return url.slice(prefix.length);
  }
}
