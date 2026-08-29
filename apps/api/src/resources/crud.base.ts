import {
  BadRequestException, Body, Delete, Get, NotFoundException, Param, Patch,
  Post, Query, UseGuards,
} from "@nestjs/common";
import type { ZodSchema } from "zod";
import { nextRevision, prisma } from "@financemanager/db";
import type { HouseholdContext } from "@financemanager/db";
import { AuthGuard } from "../auth/auth.guard";
import { HouseholdGuard } from "../household/household.guard";
import { Ctx, MinRole } from "../household/household.decorator";

/**
 * Household-scoped CRUD, written once.
 *
 * Every resource inherits this rather than repeating the same five handlers,
 * because the security property that matters — *every* query is filtered by
 * the householdId the guard resolved — then has exactly one implementation to
 * audit instead of six places to forget it.
 *
 * Two rules encoded here that are easy to get wrong per-resource:
 *
 *  - Reads and writes use findFirst/updateMany with the household in the WHERE,
 *    never findUnique/update by primary key. An id belonging to another
 *    household must answer 404, not 200 and not 403 — a 403 would confirm the
 *    row exists, which is itself a leak.
 *  - Delete is a tombstone (deletedAt + a new revision), so other devices learn
 *    the row is gone. A hard delete is invisible to sync.
 */
export abstract class HouseholdCrudController {
  /** The Prisma model delegate. Untyped on purpose: the delegates have no
   *  useful common supertype, and the scoping below is what matters. */
  protected abstract readonly delegate: any;
  /** Human name, used in 404 messages. */
  protected abstract readonly label: string;
  /** The zod schema from @financemanager/core that validates a write. */
  protected abstract readonly schema: ZodSchema;

  /** Extra defaults applied on create (e.g. a currency). */
  protected createData(_ctx: HouseholdContext, body: any): Record<string, unknown> {
    return body;
  }

  @Get()
  list(@Ctx() ctx: HouseholdContext, @Query("limit") limit?: string) {
    return this.delegate.findMany({
      where: { householdId: ctx.householdId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 200, 500),
    });
  }

  @Get(":id")
  async get(@Ctx() ctx: HouseholdContext, @Param("id") id: string) {
    const row = await this.delegate.findFirst({
      where: { id, householdId: ctx.householdId, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`${this.label} not found`);
    return row;
  }

  @Post()
  @MinRole("MEMBER")
  async create(@Ctx() ctx: HouseholdContext, @Body() body: unknown) {
    const data = this.parse(body);
    return this.delegate.create({
      data: {
        ...this.createData(ctx, data),
        householdId: ctx.householdId,
        createdById: ctx.userId,
        revision: await nextRevision(ctx.householdId),
      },
    });
  }

  @Patch(":id")
  @MinRole("MEMBER")
  async update(@Ctx() ctx: HouseholdContext, @Param("id") id: string, @Body() body: unknown) {
    const existing = await this.delegate.findFirst({
      where: { id, householdId: ctx.householdId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`${this.label} not found`);

    // A patch is merged into the current row and then validated IN FULL,
    // rather than validated as a partial. Two of the schemas
    // (transaction, recurring) are ZodEffects carrying cross-field refinements
    // — "a transfer needs a destination account" — and `.partial()` does not
    // exist on those, let alone preserve the rule. Merging first means a patch
    // that would leave the row invalid is rejected, which validating the patch
    // alone could never catch. Unknown keys (id, revision, timestamps) are
    // stripped by zod.
    const data = this.parse({ ...existing, ...(body as Record<string, unknown>) });

    await this.delegate.updateMany({
      where: { id, householdId: ctx.householdId, deletedAt: null },
      data: { ...data, revision: await nextRevision(ctx.householdId) },
    });
    return this.delegate.findFirst({ where: { id, householdId: ctx.householdId } });
  }

  @Delete(":id")
  @MinRole("MEMBER")
  async remove(@Ctx() ctx: HouseholdContext, @Param("id") id: string) {
    const { count } = await this.delegate.updateMany({
      where: { id, householdId: ctx.householdId, deletedAt: null },
      data: { deletedAt: new Date(), revision: await nextRevision(ctx.householdId) },
    });
    if (count === 0) throw new NotFoundException(`${this.label} not found`);
    return { ok: true };
  }

  private parse(body: unknown) {
    const parsed = this.schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: parsed.error.issues.map((i: any) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return parsed.data;
  }
}


/** Applied by every resource controller. */
export const HouseholdScoped = () => UseGuards(AuthGuard, HouseholdGuard);
