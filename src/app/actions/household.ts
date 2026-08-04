"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  checkHousehold,
  setActiveHousehold,
  getActiveContext,
  clearActiveHousehold,
  type Role,
} from "@/lib/household";
import { createHousehold } from "@/lib/defaults";
import { transferOwnershipTo, deleteHouseholdFor } from "@/lib/ownership";
import { CURRENCY_CODES } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

// Roles an ADMIN may assign / invite at (never OWNER — ownership isn't
// transferable in this version, which also prevents accidental lockout).
const ASSIGNABLE: Role[] = ["ADMIN", "MEMBER", "VIEWER"];

function revalidateHousehold() {
  revalidatePath("/household");
  revalidatePath("/dashboard");
}

async function ownerCount(householdId: string): Promise<number> {
  return prisma.membership.count({ where: { householdId, role: "OWNER" } });
}

export async function createHouseholdAction(formData: FormData) {
  const session = await getSession();
  const t = await getT();
  if (!session) return { error: t("err.notSignedIn") };
  const name = String(formData.get("name") ?? "").trim();
  const baseCurrency = String(formData.get("baseCurrency") ?? "USD");
  if (!name) return { error: t("valid.nameRequired") };
  if (!CURRENCY_CODES.includes(baseCurrency)) return { error: t("err.invalidCurrency") };

  const id = await createHousehold(session.userId, name, baseCurrency);
  await setActiveHousehold(id);
  revalidateHousehold();
  return { ok: true };
}

export async function switchHousehold(formData: FormData) {
  const id = String(formData.get("householdId"));
  const ok = await setActiveHousehold(id);
  if (!ok) {
    const t = await getT();
    return { error: t("err.notMemberOfHousehold") };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function renameHousehold(formData: FormData) {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const t = await getT();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: t("valid.nameRequired") };
  await prisma.household.update({ where: { id: ctx.householdId }, data: { name } });
  revalidateHousehold();
  return { ok: true };
}

export async function setHouseholdCurrency(formData: FormData) {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const baseCurrency = String(formData.get("baseCurrency") ?? "");
  if (!CURRENCY_CODES.includes(baseCurrency)) {
    const t = await getT();
    return { error: t("err.invalidCurrency") };
  }
  await prisma.household.update({
    where: { id: ctx.householdId },
    data: { baseCurrency },
  });
  revalidateHousehold();
  return { ok: true };
}

export async function inviteMember(formData: FormData) {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const t = await getT();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "MEMBER") as Role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: t("valid.email") };
  if (!ASSIGNABLE.includes(role)) return { error: t("err.invalidRole") };

  // If the person already has an account, add them directly.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const existing = await prisma.membership.findUnique({
      where: { householdId_userId: { householdId: ctx.householdId, userId: user.id } },
    });
    if (existing) return { error: t("err.alreadyMember") };
    await prisma.membership.create({
      data: { householdId: ctx.householdId, userId: user.id, role },
    });
    revalidateHousehold();
    return { ok: true };
  }

  // Otherwise store a pending invite they'll accept when they sign up.
  try {
    await prisma.invitation.create({
      data: { householdId: ctx.householdId, email, role, invitedById: ctx.userId },
    });
  } catch {
    return { error: t("err.pendingInviteExists") };
  }
  revalidateHousehold();
  return { ok: true };
}

export async function cancelInvite(formData: FormData) {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const id = String(formData.get("id"));
  await prisma.invitation.deleteMany({ where: { id, householdId: ctx.householdId } });
  revalidateHousehold();
  return { ok: true };
}

export async function changeRole(formData: FormData) {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const t = await getT();
  const membershipId = String(formData.get("membershipId"));
  const role = String(formData.get("role") ?? "") as Role;
  if (!ASSIGNABLE.includes(role)) return { error: t("err.invalidRole") };

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, householdId: ctx.householdId },
  });
  if (!target) return { error: t("err.memberNotFound") };
  if (target.role === "OWNER") return { error: t("err.cantChangeOwnerRole") };

  await prisma.membership.update({ where: { id: target.id }, data: { role } });
  revalidateHousehold();
  return { ok: true };
}

export async function removeMember(formData: FormData) {
  const { ctx, error } = await checkHousehold("ADMIN");
  if (!ctx) return { error };
  const t = await getT();
  const membershipId = String(formData.get("membershipId"));
  const target = await prisma.membership.findFirst({
    where: { id: membershipId, householdId: ctx.householdId },
  });
  if (!target) return { error: t("err.memberNotFound") };
  if (target.role === "OWNER") return { error: t("err.cantRemoveOwner") };
  if (target.userId === ctx.userId) return { error: t("err.useLeaveToRemoveSelf") };

  await prisma.membership.delete({ where: { id: target.id } });
  revalidateHousehold();
  return { ok: true };
}

export async function transferOwnership(formData: FormData) {
  const { ctx, error } = await checkHousehold("OWNER");
  if (!ctx) return { error };
  const membershipId = String(formData.get("membershipId"));
  const res = await transferOwnershipTo(ctx.householdId, ctx.userId, membershipId);
  if (res.error) return { error: (await getT())(res.error) };
  revalidatePath("/household");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteHousehold() {
  const { ctx, error } = await checkHousehold("OWNER");
  if (!ctx) return { error };
  const res = await deleteHouseholdFor(ctx.householdId, ctx.userId);
  if (res.error) return { error: (await getT())(res.error) };
  await clearActiveHousehold();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function leaveHousehold() {
  const ctx = await getActiveContext();
  const t = await getT();
  if (!ctx) return { error: t("err.notSignedIn") };
  const mine = await prisma.membership.findUnique({
    where: { householdId_userId: { householdId: ctx.householdId, userId: ctx.userId } },
  });
  if (!mine) return { error: t("err.notMember") };
  if (mine.role === "OWNER" && (await ownerCount(ctx.householdId)) <= 1) {
    return { error: t("err.onlyOwner") };
  }
  const others = await prisma.membership.count({ where: { householdId: ctx.householdId } });
  if (others <= 1) {
    return { error: t("err.onlyMember") };
  }
  await prisma.membership.delete({ where: { id: mine.id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function acceptInvite(formData: FormData) {
  const session = await getSession();
  const t = await getT();
  if (!session) return { error: t("err.notSignedIn") };
  const id = String(formData.get("id"));
  const invite = await prisma.invitation.findFirst({
    where: { id, email: session.email.toLowerCase() },
  });
  if (!invite) return { error: t("err.inviteNotFound") };
  await prisma.membership.upsert({
    where: { householdId_userId: { householdId: invite.householdId, userId: session.userId } },
    create: { householdId: invite.householdId, userId: session.userId, role: invite.role },
    update: {},
  });
  await prisma.invitation.delete({ where: { id: invite.id } });
  await setActiveHousehold(invite.householdId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function declineInvite(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: (await getT())("err.notSignedIn") };
  const id = String(formData.get("id"));
  await prisma.invitation.deleteMany({
    where: { id, email: session.email.toLowerCase() },
  });
  revalidateHousehold();
  return { ok: true };
}
