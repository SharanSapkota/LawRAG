import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { prisma, UserRole } from "@repo/database";
import type { RequestWithOptionalUser } from "../auth/jwt-request.util";

type RequestWithFile = RequestWithOptionalUser & { file?: Express.Multer.File };

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 9;
const MAX_PDFS = 1;

// Admins are exempt from the whole rate limit (message + PDF caps alike),
// not just the message count — a partial exemption would be an odd,
// inconsistent product outcome. Exported so ChatService.sendMessage's
// atomic re-check applies the same exemption.
export const UNLIMITED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

/**
 * Runs after JwtAuthGuard on POST /chat/messages. Implements CLAUDE.md
 * rule 2, steps a-e, in order. Only ever keys off request.user.userId —
 * see the note at the bottom of canActivate for why that's what makes
 * "+ New Chat" safe (rule 2a).
 *
 * This is a fast, well-worded pre-check for the common case — it is NOT
 * the sole authority on the quota. Its read-then-write reset/check has a
 * TOCTOU race under concurrent requests from the same user. ChatService
 * .sendMessage repeats the cap check as a single atomic conditional UPDATE
 * inside the same transaction as the message insert, which is what
 * actually closes that race; this guard exists so most rejections get a
 * clean 429 without needing a transaction at all.
 */
@Injectable()
export class MessageQuotaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithFile>();
    // JwtAuthGuard runs before this guard on POST /chat/messages and always
    // sets request.user (or the request is already rejected with 401), so
    // this is safe to assume non-null here.
    const userId = request.user!.userId;

    if (UNLIMITED_ROLES.has(request.user!.role)) {
      return true;
    }

    const now = new Date();

    // a. Fetch (or create) the user's MessageUsage row.
    let usage = await prisma.messageUsage.findUnique({ where: { userId } });

    if (!usage) {
      usage = await prisma.messageUsage.create({
        data: { userId, messageCount: 0, pdfCount: 0, windowStartAt: now },
      });
    }

    // b. Reset the window if it's expired, persisting before continuing.
    const windowEnd = new Date(usage.windowStartAt.getTime() + WINDOW_MS);
    if (now > windowEnd) {
      usage = await prisma.messageUsage.update({
        where: { userId },
        data: { messageCount: 0, pdfCount: 0, windowStartAt: now },
      });
    }

    // c. Total message cap.
    if (usage.messageCount >= MAX_MESSAGES) {
      const retryAfter = new Date(usage.windowStartAt.getTime() + WINDOW_MS);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "MESSAGE_QUOTA_EXCEEDED",
          // TODO(decisions.md O4): exact user-facing copy for the
          // "come back in X hours" message is still an open product decision.
          message: "Message limit reached for this window. Email iamsharan77@gmail.com to increase your limit. Or",
          retryAfter: retryAfter.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // d. PDF cap, checked independently of the total cap. `request.file` is
    // populated by the multer middleware applied in ChatModule.configure(),
    // which runs before guards — so it's already available here, and it
    // reflects an actual uploaded file rather than a client-asserted flag.
    const hasPdfAttachment = Boolean(request.file);

    if (hasPdfAttachment && usage.pdfCount >= MAX_PDFS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "PDF_QUOTA_EXCEEDED",
          message: "You've already used your 1 PDF upload for this window.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // e. Otherwise allow through. Note: this guard only ever reads/writes
    // MessageUsage by `userId` (from the verified JWT) — `sessionId` from
    // the request body is never referenced anywhere above. That's what
    // makes "+ New Chat" safe: a fresh ChatSession has no bearing on this
    // check, since it isn't part of the lookup key.
    return true;
  }
}
