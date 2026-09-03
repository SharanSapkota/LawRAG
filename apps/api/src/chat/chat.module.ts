import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import multer from "multer";
import { AiModule } from "../ai/ai.module";
import { AuthModule } from "../auth/auth.module";
import { PdfModule } from "../pdf/pdf.module";
import { StorageModule } from "../storage/storage.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { MessageQuotaGuard } from "./message-quota.guard";

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB — a reasonable default, not specified by CLAUDE.md

// Applied as Nest middleware, not the FileInterceptor decorator: Nest's
// request lifecycle runs middleware -> guards -> interceptors, so a
// FileInterceptor's multipart parsing would happen AFTER MessageQuotaGuard
// runs, meaning the guard couldn't see the uploaded file. Middleware runs
// first, so req.file is already set by the time either guard executes.
const pdfUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES },
}).single("pdf");

@Module({
  imports: [AuthModule, StorageModule, PdfModule, AiModule],
  controllers: [ChatController],
  providers: [ChatService, MessageQuotaGuard],
})
export class ChatModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(pdfUploadMiddleware)
      .forRoutes({ path: "chat/messages", method: RequestMethod.POST });
  }
}
