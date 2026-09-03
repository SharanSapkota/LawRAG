import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RequestWithOptionalUser } from "./jwt-request.util";
import { resolveRequestUser } from "./jwt-request.util";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOptionalUser>();
    const user = await resolveRequestUser(this.jwtService, request);

    if (!user) {
      throw new UnauthorizedException("Missing bearer token");
    }

    request.user = user;
    return true;
  }
}
