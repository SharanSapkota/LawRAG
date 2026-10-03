import { Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/database";
import { randomUUID } from "node:crypto";

export interface InsertChunkInput {
  documentId: string;
  content: string;
  originalContent: string | null;
  sectionRef: string | null;
  embedding: number[];
  originalEmbedding: any;
}

export interface SimilarChunkResult {
  id: string;
  documentId: string;
  content: string;
  originalContent: string | null;
  sectionRef: string | null;
  documentTitle: string;
  similarity: number;
}

const DEFAULT_SIMILARITY_LIMIT = 5;

/**
 * The one place in the codebase allowed to read/write
 * law_document_chunks.embedding. Prisma's schema marks that column
 * Unsupported("vector(1536)"), so the generated client has no typed field
 * for it at all — every operation here goes through $queryRaw.
 *
 * Every method takes a Prisma client (either the global `prisma` or a
 * `tx` from an interactive transaction) rather than importing the global
 * singleton directly, so callers can compose these into a larger
 * transaction (see DocumentsService.processDocument).
 *
 * NOTE for whoever builds section 7 (retrieval): a future
 * findSimilarChunks()-type method here MUST join to law_documents and
 * filter `WHERE law_documents.status = 'PUBLISHED'` — nothing in this
 * file does that filtering today because nothing here reads chunks back
 * out, only writes them. See ChatService/DocumentsService — neither
 * queries LawDocumentChunk for retrieval; that code doesn't exist yet.
 */
@Injectable()
export class LawDocumentChunkRepository {
  async deleteAllForDocument(db: Prisma.TransactionClient, documentId: string): Promise<void> {
    await db.lawDocumentChunk.deleteMany({ where: { documentId } });
  }

  async insertChunk(db: Prisma.TransactionClient, input: InsertChunkInput): Promise<string> {
    const id = randomUUID();
    const vectorLiteral = `[${input.embedding.join(",")}]`;

    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO law_document_chunks (id, document_id, content, original_content, section_ref, embedding, created_at, updated_at)
      VALUES (${id}, ${input.documentId}, ${input.content}, ${input.originalContent}, ${input.sectionRef}, ${vectorLiteral}::vector, now(), now())
      RETURNING id
    `;

    return rows[0].id;
  }

  /**
   * Vector similarity search via cosine distance (`<=>`), matching the
   * ivfflat `vector_cosine_ops` index built on this column — ORDER BY
   * uses the raw `embedding <=> vector` expression (not a transformed
   * value) specifically so Postgres can recognize it against that index's
   * operator class and use an ANN index scan rather than a full table scan.
   *
   * The INNER JOIN to law_documents with `ld.status = 'PUBLISHED'` is the
   * only thing standing between this query and every DRAFT chunk in the
   * table — there is no other filter. Because it's an INNER JOIN (not
   * LEFT), any chunk whose parent document fails that condition is
   * excluded from the result set entirely, regardless of how similar its
   * embedding is; a chunk cannot appear in the output without its
   * document also being PUBLISHED.
   */
  async findSimilarChunks(
    db: Prisma.TransactionClient,
    queryEmbedding: number[],
    limit: number = DEFAULT_SIMILARITY_LIMIT,
  ): Promise<SimilarChunkResult[]> {
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    return db.$queryRaw<SimilarChunkResult[]>`
      SELECT
        ldc.id,
        ldc.document_id AS "documentId",
        ldc.content,
        ldc.original_content AS "originalContent",
        ldc.section_ref AS "sectionRef",
        ld.title AS "documentTitle",
        1 - (ldc.embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM law_document_chunks ldc
      JOIN law_documents ld ON ld.id = ldc.document_id
      WHERE ld.status = 'PUBLISHED'
      ORDER BY ldc.embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;
  }
}
