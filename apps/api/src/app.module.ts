import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";
import { ChatModule } from "./chat/chat.module";
import { DocumentsModule } from "./documents/documents.module";

@Module({
  imports: [AuthModule, CategoriesModule, ChatModule, DocumentsModule],
})
export class AppModule {}
