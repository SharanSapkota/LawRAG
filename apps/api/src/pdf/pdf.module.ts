import { Module } from "@nestjs/common";
import { PdfExtractionService } from "./pdf-extraction.service";

@Module({
  providers: [PdfExtractionService],
  exports: [PdfExtractionService],
})
export class PdfModule {}
