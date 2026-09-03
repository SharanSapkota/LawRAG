import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@repo/database";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { fixMulterFilenameEncoding } from "../storage/fix-filename-encoding.util";
import { DocumentsService } from "./documents.service";
import { RenameDocumentDto } from "./dto/rename-document.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50MB — reasonable default, not specified by CLAUDE.md

// No guard here needs to inspect the file before the handler runs (unlike
// MessageQuotaGuard in chat), so the standard FileInterceptor pattern is
// used instead of module-level middleware.
@Controller("admin/documents")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async list() {
    return this.documentsService.listDocuments();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException("A file is required");
    }

    // v1: PDF only. DOCX/other formats would need a separate extraction
    // path (e.g. mammoth for .docx) — not built, rejected explicitly here
    // rather than silently mishandled.
    if (file.mimetype !== "application/pdf") {
      throw new BadRequestException("Only PDF uploads are supported in v1");
    }

    const fixedFile: Express.Multer.File = {
      ...file,
      originalname: fixMulterFilenameEncoding(file.originalname),
    };

    return this.documentsService.createDraftDocument({
      categoryId: body.categoryId,
      title: body.title,
      sourceRef: body.sourceRef,
      file: fixedFile,
    });
  }

  @Patch(":id")
  async rename(@Param("id") id: string, @Body() body: RenameDocumentDto) {
    return this.documentsService.renameDocument(id, body.title);
  }

  @Post(":id/process")
  async process(@Param("id") id: string) {
    return this.documentsService.processDocument(id);
  }

  @Post(":id/publish")
  async publish(@Param("id") id: string) {
    return this.documentsService.publishDocument(id);
  }
}
