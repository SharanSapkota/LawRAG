-- DropIndex
DROP INDEX "idx_chunks_embedding";

-- AlterTable
ALTER TABLE "law_document_chunks" ADD COLUMN     "original_embedding" vector(1536);
