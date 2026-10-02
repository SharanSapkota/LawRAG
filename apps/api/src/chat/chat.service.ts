import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma, MessageRole, type ChatMessage, type ChatSession } from "@repo/database";
import type { AuthenticatedRequestUser } from "../auth/jwt-request.util";
import { AI_SERVICE, type AiService, type RetrievedSource } from "../ai/ai.service";
import { PdfExtractionService } from "../pdf/pdf-extraction.service";
import { StorageService } from "../storage/storage.service";
import { UNLIMITED_ROLES } from "./message-quota.guard";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 9;
const MAX_PDFS = 1;
const MAX_TITLE_LENGTH = 60;

/**
 * Auto-title from the first message's text — no extra LLM call. Simpler,
 * free, and instant compared to asking the model to summarize a title;
 * an LLM-generated title is a reasonable future upgrade if this proves
 * too blunt in practice, but wasn't worth the added cost/latency on
 * every single first message for v1.
 */
function deriveTitle(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_TITLE_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}

export interface SendMessageResult {
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  sources: RetrievedSource[];
}

@Injectable()
export class ChatService {
  constructor(
    private readonly storageService: StorageService,
    private readonly pdfExtractionService: PdfExtractionService,
    @Inject(AI_SERVICE) private readonly aiService: AiService,
  ) {}

  /**
   * Creates a ChatSession only — this is the entire "+ New Chat" contract.
   * It deliberately never touches MessageUsage: the message rate limit is
   * keyed by userId (enforced on POST /chat/messages), so spawning a new
   * session can never grant extra messages.
   */
  async createSession(
    user: AuthenticatedRequestUser | null,
    title?: string,
  ): Promise<ChatSession> {
    return prisma.chatSession.create({
      data: {
        userId: user?.userId ?? null,
        isPublicPreview: user === null,
        title,
      },
    });
  }

  /**
   * Lists the authenticated user's own sessions, most-recently-active
   * first — powers the sidebar chat history. Anonymous/public-preview
   * sessions (userId = null) never appear here; there's no persistent
   * guest identity to list them against.
   */
  async listSessionsForUser(userId: string): Promise<ChatSession[]> {
    return prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getSessionForRequest(id: string, user: AuthenticatedRequestUser | null) {
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: true },
    });

    if (!session) {
      throw new NotFoundException("Chat session not found");
    }

    const isOwner = session.userId !== null && session.userId === user?.userId;

    // 403, not 404: session IDs are unguessable UUIDs, so confirming
    // existence while denying access is clearer than pretending it doesn't
    // exist, and matches CLAUDE.md's "guest read, no write" framing of this
    // as an access-control rejection rather than a lookup failure.
    if (!isOwner && !session.isPublicPreview) {
      throw new ForbiddenException("You do not have access to this chat session");
    }

    return session;
  }

  /**
   * Full send-message flow: upload + extract the PDF (if any) outside the
   * transaction (slow external I/O has no business holding a DB
   * transaction open), then validate ownership, atomically re-check the
   * quota, and insert the user's message (+ attachment) as one all-or-
   * nothing unit. The AI response is generated and inserted afterward, as
   * its own step — CLAUDE.md's transactional requirement covers the user
   * message, attachment, and counter increment, not the AI reply.
   */
  async sendMessage(
    user: AuthenticatedRequestUser,
    sessionId: string,
    content: string,
    file?: Express.Multer.File,
  ): Promise<SendMessageResult> {
    let attachment: { url: string; mimeType: string; extractedText: string } | undefined;

    if (file) {
      const { url } = await this.storageService.uploadFile({
        buffer: file.buffer,
        contentType: file.mimetype,
        fileName: file.originalname,
      });
      const extractedText = await this.pdfExtractionService.extractText(file.buffer);
      attachment = { url, mimeType: file.mimetype, extractedText };
    }

    const hasPdfAttachment = Boolean(attachment);

    const userMessage = await prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.findUnique({ where: { id: sessionId } });

      if (!session) {
        throw new NotFoundException("Chat session not found");
      }

      if (session.userId !== user.userId) {
        throw new ForbiddenException("You do not have access to this chat session");
      }

      // Admins are exempt from the rate limit entirely — same exemption
      // as MessageQuotaGuard, kept in one place (UNLIMITED_ROLES) so the
      // two enforcement points can't drift apart. MessageUsage is never
      // touched for an exempt user, same as the "+ New Chat" contract
      // never touching it — there's nothing to cap, so nothing to track.
      if (!UNLIMITED_ROLES.has(user.role)) {
        // See message-quota.guard.ts for why this repeats the guard's
        // check as one atomic conditional UPDATE rather than trusting the
        // guard's earlier (racy) read.
        const quotaUpdate = await tx.messageUsage.updateMany({
          where: {
            userId: user.userId,
            messageCount: { lt: MAX_MESSAGES },
            ...(hasPdfAttachment ? { pdfCount: { lt: MAX_PDFS } } : {}),
          },
          data: {
            messageCount: { increment: 1 },
            ...(hasPdfAttachment ? { pdfCount: { increment: 1 } } : {}),
          },
        });

        if (quotaUpdate.count === 0) {
          const usage = await tx.messageUsage.findUnique({ where: { userId: user.userId } });

          if (hasPdfAttachment && usage && usage.pdfCount >= MAX_PDFS) {
            throw new HttpException(
              {
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                error: "PDF_QUOTA_EXCEEDED",
                message: "You've already used your 1 PDF upload for this window.",
              },
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          const retryAfter = usage
            ? new Date(usage.windowStartAt.getTime() + WINDOW_MS).toISOString()
            : undefined;

          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: "MESSAGE_QUOTA_EXCEEDED",
              // TODO(decisions.md O4): exact user-facing copy for the
              // "come back in X hours" message is still an open product decision.
              message:
                "Message limit reached for this window. Email iamsharan77@gmail.com to increase your limit.",
              retryAfter,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      const message = await tx.chatMessage.create({
        data: {
          sessionId,
          role: MessageRole.USER,
          content,
        },
      });

      // Auto-title on the first message only (title stays whatever it
      // was once set). This update also bumps session.updatedAt (Prisma
      // touches @updatedAt on any update() call, even one that only
      // changes title) — needed so "most recently active" sidebar
      // ordering is meaningful; inserting a ChatMessage doesn't bump its
      // parent ChatSession's updatedAt on its own.
      await tx.chatSession.update({
        where: { id: sessionId },
        data: session.title ? {} : { title: deriveTitle(content) },
      });

      if (attachment) {
        await tx.messageAttachment.create({
          data: {
            messageId: message.id,
            fileUrl: attachment.url,
            mimeType: attachment.mimeType,
            extractedText: attachment.extractedText,
          },
        });
      }

      return message;
    });

    const aiResult = await this.aiService.generateResponse({
      userMessage: content,
      pdfContext: attachment?.extractedText,
    });

    const aiMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: MessageRole.ASSISTANT,
        content: aiResult.content,
      },
    });

    // sources aren't persisted — ChatMessage has no column for them
    // (would need a schema/migration change, out of scope here) — they're
    // only surfaced in this response payload for the caller to display.
    return { userMessage, aiMessage, sources: aiResult.sources };
  }
}
