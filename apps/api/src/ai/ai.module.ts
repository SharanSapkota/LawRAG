import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { EmbeddingModule } from "../embedding/embedding.module";
import { AI_SERVICE, OpenAiAiService } from "./ai.service";

@Module({
  imports: [DocumentsModule, EmbeddingModule],
  providers: [{ provide: AI_SERVICE, useClass: OpenAiAiService }],
  exports: [AI_SERVICE],
})
export class AiModule {}
