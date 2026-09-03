import { Injectable, InternalServerErrorException } from "@nestjs/common";
import OpenAI from "openai";

const VECTOR_DIMENSION = 1536; // matches vector(1536) in schema.prisma — this IS
// text-embedding-3-small's native output size, so no schema change needed.
const EMBEDDING_MODEL = "text-embedding-3-small";

// text-embedding-3-small's real limit is 8191 tokens. chunk-text.util.ts
// already caps chunks at 2000 characters, which is comfortably under this
// even for dense non-English text (worst case ~1 char/token) — this
// constant is a defensive guard against that invariant being violated
// (e.g. by a future change to chunking), not something expected to fire
// in normal operation.
const MAX_INPUT_CHARS = 8000;

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

export const EMBEDDING_SERVICE = Symbol("EMBEDDING_SERVICE");

/**
 * Real embedding provider (decisions.md O1 now resolved for embeddings —
 * OpenAI text-embedding-3-small). Everything upstream (DocumentsService,
 * LawDocumentChunkRepository) depends only on the EmbeddingService
 * interface, so this is the only file that changed to go from mock to real.
 */
@Injectable()
export class OpenAiEmbeddingService implements EmbeddingService {
  private readonly client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async embed(text: string): Promise<number[]> {
    if (text.length > MAX_INPUT_CHARS) {
      // Deliberately NOT truncating or re-splitting here: truncation would
      // silently embed partial content, and further splitting is
      // chunk-text.util.ts's job, not this service's — out of scope for
      // this step. Failing loudly surfaces that chunking produced an
      // oversized chunk, which is the actual bug to fix.
      throw new InternalServerErrorException(
        `Chunk text (${text.length} chars) exceeds the safe embedding input limit ` +
          `(${MAX_INPUT_CHARS} chars) — this indicates an oversized chunk from ` +
          `chunk-text.util.ts, not something this step truncates or splits.`,
      );
    }

    let response: OpenAI.Embeddings.CreateEmbeddingResponse;

    try {
      response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });
    } catch (err) {
      // Covers rate limits, network failures, and invalid-key auth errors
      // alike — "basic" error handling per this step's scope, not a
      // per-status-code retry/backoff strategy.
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`OpenAI embedding request failed: ${message}`);
    }

    const embedding = response.data[0]?.embedding;

    if (!embedding || embedding.length !== VECTOR_DIMENSION) {
      throw new InternalServerErrorException(
        `OpenAI returned an embedding of unexpected shape (expected ${VECTOR_DIMENSION} ` +
          `dims, got ${embedding?.length ?? "none"})`,
      );
    }

    return embedding;
  }
}
