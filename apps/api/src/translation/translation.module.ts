import { Module } from "@nestjs/common";
import { OpenAiTranslationService, TRANSLATION_SERVICE } from "./translation.service";

@Module({
  providers: [{ provide: TRANSLATION_SERVICE, useClass: OpenAiTranslationService }],
  exports: [TRANSLATION_SERVICE],
})
export class TranslationModule {}
