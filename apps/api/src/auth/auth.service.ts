import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { prisma, type User } from "@repo/database";

export interface NestJwtPayload {
  sub: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  constructor(private readonly jwtService: JwtService) {}

  async verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("Invalid Google ID token");
    }

    if (!payload) {
      throw new UnauthorizedException("Invalid Google ID token");
    }

    return payload;
  }

  async upsertUserFromGoogle(payload: TokenPayload): Promise<User> {
    return prisma.user.upsert({
      where: { googleId: payload.sub },
      create: {
        googleId: payload.sub,
        name: payload.name,
        email: payload.email,
        image: payload.picture,
      },
      update: {
        name: payload.name,
        email: payload.email,
        image: payload.picture,
      },
    });
  }

  issueJwt(user: User): string {
    const payload: NestJwtPayload = { sub: user.id, role: user.role };
    return this.jwtService.sign(payload);
  }
}
