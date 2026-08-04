"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { CURRENCIES } from "@/lib/constants";
import {
  inviteMember,
  changeRole,
  removeMember,
  cancelInvite,
  renameHousehold,
  setHouseholdCurrency,
  createHouseholdAction,
  leaveHousehold,
  acceptInvite,
  declineInvite,
  transferOwnership,
  deleteHousehold,
} from "@/app/actions/household";

type Result = { ok?: boolean; error?: string } | undefined;
type Action = (fd: FormData) => Promise<Result> | Promise<unknown>;

const ASSIGNABLE = ["ADMIN", "MEMBER", "VIEWER"] as const;

/** Generic form that runs a server action, then refreshes. Optional confirm. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const run = async (fd: FormData) => {
    await action(fd);
    router.refresh();
  };
  return (
    <form
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

function Pending({ label, busy }: { label: string; busy?: string }) {
  const { pending } = useFormStatus();
  return <>{pending ? busy ?? "…" : label}</>;
}

export function InviteForm() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function action(fd: FormData) {
    setError(null);
    setMsg(null);
    const res = await inviteMember(fd);
    if (res?.error) setError(res.error);
    else {
      setMsg(t("household.invitationSent"));
      router.refresh();
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[180px]">
        <label className="label">{t("household.inviteByEmail")}</label>
        <input name="email" type="email" required placeholder="person@example.com" className="input" />
      </div>
      <div>
        <label className="label">{t("household.role")}</label>
        <select name="role" className="input" defaultValue="MEMBER">
          {ASSIGNABLE.map((opt) => (
            <option key={opt} value={opt}>{t("enum.role." + opt)}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary">
        <Pending label={t("household.invite")} busy={t("household.inviting")} />
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {msg && <p className="w-full text-sm text-green-600">{msg}</p>}
    </form>
  );
}

export function RoleSelect({ membershipId, role }: { membershipId: string; role: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("membershipId", membershipId);
    fd.set("role", e.target.value);
    await changeRole(fd);
    start(() => router.refresh());
  }
  return (
    <select defaultValue={role} onChange={onChange} disabled={pending} className="input py-1 w-28 text-sm">
      {ASSIGNABLE.map((opt) => (
        <option key={opt} value={opt}>{t("enum.role." + opt)}</option>
      ))}
    </select>
  );
}

export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  const t = useT();
  return (
    <ActionForm action={removeMember} confirm={t("household.removeConfirm", { name })}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50 px-2 py-1 text-sm">
        {t("household.remove")}
      </button>
    </ActionForm>
  );
}

export function MakeOwnerButton({ membershipId, name }: { membershipId: string; name: string }) {
  const t = useT();
  return (
    <ActionForm
      action={transferOwnership}
      confirm={t("household.makeOwnerConfirm", { name })}
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <button type="submit" className="btn-ghost px-2 py-1 text-sm hover:bg-[var(--hover)]">
        {t("household.makeOwner")}
      </button>
    </ActionForm>
  );
}

export function DeleteHouseholdButton() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function action() {
    setError(null);
    const res = await deleteHousehold();
    if (res?.error) setError(res.error);
    else router.refresh();
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("household.deleteConfirm")))
          e.preventDefault();
      }}
    >
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50">
        {t("household.deleteHousehold")}
      </button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </form>
  );
}

export function CancelInviteButton({ id }: { id: string }) {
  const t = useT();
  return (
    <ActionForm action={cancelInvite}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50 px-2 py-1 text-sm">
        {t("household.cancel")}
      </button>
    </ActionForm>
  );
}

export function InviteResponse({ id }: { id: string }) {
  const t = useT();
  return (
    <div className="flex gap-2">
      <ActionForm action={acceptInvite}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-primary px-3 py-1 text-sm">{t("household.accept")}</button>
      </ActionForm>
      <ActionForm action={declineInvite}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-ghost border border-[var(--border)] px-3 py-1 text-sm">{t("household.decline")}</button>
      </ActionForm>
    </div>
  );
}

export function HouseholdSettingsForm({
  name,
  baseCurrency,
}: {
  name: string;
  baseCurrency: string;
}) {
  const t = useT();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(fd: FormData) {
    setMsg(null);
    setError(null);
    const [r1, r2] = await Promise.all([
      renameHousehold(fd),
      setHouseholdCurrency(fd),
    ]);
    const err = r1?.error || r2?.error;
    if (err) setError(err);
    else {
      setMsg(t("household.saved"));
      router.refresh();
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label className="label">{t("household.householdName")}</label>
        <input name="name" defaultValue={name} required className="input" />
      </div>
      <div>
        <label className="label">{t("household.reportingCurrency")}</label>
        <select name="baseCurrency" defaultValue={baseCurrency} className="input">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary"><Pending label={t("common.save")} busy={t("common.saving")} /></button>
      {msg && <span className="text-sm text-green-600">{msg}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}

export function NewHouseholdForm() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function action(fd: FormData) {
    setError(null);
    const res = await createHouseholdAction(fd);
    if (res?.error) setError(res.error);
    else router.refresh();
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[180px]">
        <label className="label">{t("household.newHouseholdName")}</label>
        <input name="name" required placeholder={t("household.newHouseholdPlaceholder")} className="input" />
      </div>
      <div>
        <label className="label">{t("household.currency")}</label>
        <select name="baseCurrency" className="input" defaultValue="USD">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-ghost border border-[var(--border)]">
        <Pending label={t("household.create")} busy={t("household.creating")} />
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function LeaveHouseholdButton() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function action() {
    setError(null);
    const res = await leaveHousehold();
    if (res?.error) setError(res.error);
    else router.refresh();
  }
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(t("household.leaveConfirm"))) e.preventDefault(); }}>
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50">{t("household.leave")}</button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </form>
  );
}
