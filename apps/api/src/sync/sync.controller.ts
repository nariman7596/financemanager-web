import {
  BadRequestException, Body, Controller, Get, Headers, NotFoundException,
  Param, Post, Query, UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import {
  formatCursor, listConflicts, parseCursor, pullChanges, pushOps,
  resolveConflict, saveCursor, SYNC_ENTITIES,
} from "@financemanager/db";
import type { HouseholdContext } from "@financemanager/db";
import { AuthGuard } from "../auth/auth.guard";
import { HouseholdGuard } from "../household/household.guard";
import { Ctx, MinRole } from "../household/household.decorator";

const entityNames = SYNC_ENTITIES.map((e) => e.name) as [string, ...string[]];

const pushSchema = z.object({
  deviceId: z.string().min(1),
  ops: z
    .array(
      z.object({
        opId: z.string().min(1),
        entity: z.enum(entityNames),
        id: z.string().min(1),
        op: z.enum(["upsert", "delete"]),
        baseRevision: z.string().nullable().optional(),
        payload: z.record(z.unknown()).optional(),
      }),
    )
    // A cap so one client cannot hold a write transaction open indefinitely.
    .max(500),
});

@ApiTags("sync")
@Controller("sync")
@UseGuards(AuthGuard, HouseholdGuard)
export class SyncController {
  // Sync is chatty by design and must not be throttled like a login. A phone
  // catching up after a week can legitimately make many requests in a minute.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Get("changes")
  async changes(
    @Ctx() ctx: HouseholdContext,
    @Query("since") since?: string,
    @Query("limit") limit?: string,
    @Headers("x-device-id") deviceId?: string,
  ) {
    const cursor = parseCursor(since);
    const result = await pullChanges(ctx.householdId, cursor, Number(limit) || 500);

    // Remember how far this device has read, so tombstones it has already seen
    // can eventually be swept. Only once the page was actually produced.
    if (deviceId) {
      await saveCursor(deviceId, ctx.householdId, parseCursor(result.nextCursor));
    }
    return { ...result, cursor: formatCursor(cursor) };
  }

  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post("push")
  @MinRole("MEMBER")
  async push(@Ctx() ctx: HouseholdContext, @Body() body: unknown) {
    const parsed = pushSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return pushOps(ctx.householdId, parsed.data.deviceId, parsed.data.ops as any);
  }

  @Get("conflicts")
  conflicts(@Ctx() ctx: HouseholdContext, @Query("all") all?: string) {
    return listConflicts(ctx.householdId, all === "true");
  }

  @Post("conflicts/:id/resolve")
  @MinRole("MEMBER")
  async resolve(@Ctx() ctx: HouseholdContext, @Param("id") id: string) {
    if (!(await resolveConflict(ctx.householdId, id))) {
      throw new NotFoundException("Conflict not found");
    }
    return { ok: true };
  }
}
