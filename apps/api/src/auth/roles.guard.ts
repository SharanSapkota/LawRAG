import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@repo/database";
import type { RequestWithOptionalUser } from "./jwt-request.util";
import { ROLES_KEY } from "./roles.decorator";

/**
 * Must run after JwtAuthGuard (needs request.user already set) — pair as
 * @UseGuards(JwtAuthGuard, RolesGuard). Role is read exclusively from
 * request.user.role, which JwtAuthGuard populated from the verified JWT
 * payload — this guard never looks at the request body, so a client can't
 * claim a role for itself.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithOptionalUser>();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException("Insufficient role for this action");
    }

    return true;
  }
}
