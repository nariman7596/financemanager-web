import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasRole, resolveHouseholdContext } from "@financemanager/db";
import type { Role } from "@financemanager/core/access";
import { MIN_ROLE_KEY } from "./household.decorator";

/**
 * Resolve the caller's household and enforce the route's minimum role.
 *
 * The `X-Household-Id` header is a *preference*, exactly like the web app's
 * fm_household cookie: resolveHouseholdContext honours it only when a
 * Membership backs it, and otherwise falls back to the user's own first
 * household. A forged id therefore grants nothing — it cannot even be used to
 * probe for existence, because an unknown id is indistinguishable from a stale
 * one and both simply resolve to the caller's own data.
 *
 * Both transports share that resolution (packages/db/src/access.ts), so the
 * API cannot drift from the policy the web app enforces.
 */
@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req.auth?.userId) throw new UnauthorizedException("Not authenticated");

    const wanted = req.headers?.["x-household-id"];
    const ctx = await resolveHouseholdContext(
      req.auth.userId,
      typeof wanted === "string" ? wanted : undefined,
    );
    if (!ctx) throw new ForbiddenException("You do not belong to a household");

    const minRole =
      this.reflector.getAllAndOverride<Role>(MIN_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "VIEWER";

    if (!hasRole(ctx, minRole)) {
      throw new ForbiddenException(`This action needs ${minRole} access`);
    }

    req.household = ctx;
    return true;
  }
}
