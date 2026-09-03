import { UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { UserRole } from "@repo/database";
import type { NestJwtPayload } from "./auth.service";

export interface AuthenticatedRequestUser {
  userId: string;
  role: UserRole;
}

export type RequestWithOptionalUser = Request & { user?: AuthenticatedRequestUser };

/**
 * Shared by JwtAuthGuard and OptionalJwtAuthGuard. Returns null only when no
 * Authorization header was sent at all — a header that IS present but
 * malformed or fails verification always throws, so a bad token never
 * silently downgrades a request to "anonymous".
 */
export async function resolveRequestUser(
  jwtService: JwtService,
  request: Request,
): Promise<AuthenticatedRequestUser | null> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedException("Malformed Authorization header");
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = await jwtService.verifyAsync<NestJwtPayload>(token);
    return { userId: payload.sub, role: payload.role as UserRole };
  } catch {
    throw new UnauthorizedException("Invalid or expired token");
  }
}
