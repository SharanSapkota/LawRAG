import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import type { RequestWithOptionalUser } from "../auth/jwt-request.util";
import { fixMulterFilenameEncoding } from "../storage/fix-filename-encoding.util";
import { ChatService } from "./chat.service";
import { CreateSessionDto } from "./dto/create-session.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { MessageQuotaGuard } from "./message-quota.guard";

type RequestWithFile = RequestWithOptionalUser & { file?: Express.Multer.File };

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // Optional auth: an authenticated caller gets a session tied to their
  // userId; an anonymous caller gets userId = null, isPublicPreview = true.
  // No MessageUsage reference anywhere in this file/service — see
  // ChatService.createSession's doc comment.
  @UseGuards(OptionalJwtAuthGuard)
  @Post("sessions")
  async createSession(@Req() req: RequestWithOptionalUser, @Body() body: CreateSessionDto) {
    return this.chatService.createSession(req.user ?? null, body.title);
  }

  // Optional auth: guests can view public-preview sessions; owners can
  // view their own; everyone else is rejected (see ChatService for the
  // 403-vs-404 reasoning).
  // Required auth: only an authenticated user has a persistent identity
  // to list sessions against — guests have no history to show.
  @UseGuards(JwtAuthGuard)
  @Get("sessions")
  async listSessions(@Req() req: RequestWithOptionalUser) {
    return this.chatService.listSessionsForUser(req.user!.userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get("sessions/:id")
  async getSession(@Param("id") id: string, @Req() req: RequestWithOptionalUser) {
    return this.chatService.getSessionForRequest(id, req.user ?? null);
  }

  // Required auth: JwtAuthGuard rejects with 401 before this handler ever
  // runs if there's no valid bearer token. MessageQuotaGuard then runs
  // second, gating on the CLAUDE.md rule 2 quota checks. The multer
  // middleware registered in ChatModule.configure() parses the optional
  // "pdf" multipart field into req.file before either guard runs. All
  // upload/extraction/persistence/AI orchestration lives in the service —
  // this handler just delegates.
  @UseGuards(JwtAuthGuard, MessageQuotaGuard)
  @Post("messages")
  async sendMessage(@Req() req: RequestWithFile, @Body() body: SendMessageDto) {
    const file = req.file
      ? { ...req.file, originalname: fixMulterFilenameEncoding(req.file.originalname) }
      : undefined;
    return this.chatService.sendMessage(req.user!, body.sessionId, body.content, file);
  }
}
