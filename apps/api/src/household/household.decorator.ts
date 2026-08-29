import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { HouseholdContext } from "@financemanager/db";
import type { Role } from "@financemanager/core/access";

export const MIN_ROLE_KEY = "minRole";

/** Minimum role required for a route. Defaults to VIEWER when absent. */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);

/**
 * The resolved {userId, householdId, role}.
 *
 * Controllers must scope every query by `ctx.householdId` — the value a
 * Membership proved — and never by a household id taken from the body, the
 * query string or a path parameter.
 */
export const Ctx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HouseholdContext =>
    context.switchToHttp().getRequest().household,
);
