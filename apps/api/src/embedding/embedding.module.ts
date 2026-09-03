import { Module } from "@nestjs/common";
import { EMBEDDING_SERVICE, OpenAiEmbeddingService } from "./embedding.service";

@Module({
  providers: [{ provide: EMBEDDING_SERVICE, useClass: OpenAiEmbeddingService }],
  exports: [EMBEDDING_SERVICE],
})
export class EmbeddingModule {}
