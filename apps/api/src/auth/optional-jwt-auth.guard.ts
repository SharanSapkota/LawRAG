import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RequestWithOptionalUser } from "./jwt-request.util";
import { resolveRequestUser } from "./jwt-request.util";

/**
 * Like JwtAuthGuard, but never rejects a request for having no token —
 * `request.user` is simply left unset, so guest/anonymous requests proceed.
 * A token that IS present but invalid/expired still throws 401 (see
 * resolveRequestUser) rather than silently falling back to anonymous.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOptionalUser>();
    const user = await resolveRequestUser(this.jwtService, request);

    if (user) {
      request.user = user;
    }

    return true;
  }
}
