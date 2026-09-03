import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmbeddingModule } from "../embedding/embedding.module";
import { PdfModule } from "../pdf/pdf.module";
import { StorageModule } from "../storage/storage.module";
import { TranslationModule } from "../translation/translation.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { LawDocumentChunkRepository } from "./law-document-chunk.repository";

@Module({
  imports: [AuthModule, StorageModule, PdfModule, EmbeddingModule, TranslationModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, LawDocumentChunkRepository],
  // LawDocumentChunkRepository exported for AiModule's RAG retrieval.
  exports: [LawDocumentChunkRepository],
})
export class DocumentsModule {}
