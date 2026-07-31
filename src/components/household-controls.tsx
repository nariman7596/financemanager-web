"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function action(fd: FormData) {
    setError(null);
    setMsg(null);
    const res = await inviteMember(fd);
    if (res?.error) setError(res.error);
    else {
      setMsg("Invitation sent");
      router.refresh();
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[180px]">
        <label className="label">Invite by email</label>
        <input name="email" type="email" required placeholder="person@example.com" className="input" />
      </div>
      <div>
        <label className="label">Role</label>
        <select name="role" className="input" defaultValue="MEMBER">
          {ASSIGNABLE.map((r) => (
            <option key={r} value={r}>{r.toLowerCase()}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary">
        <Pending label="Invite" busy="Inviting…" />
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {msg && <p className="w-full text-sm text-green-600">{msg}</p>}
    </form>
  );
}

export function RoleSelect({ membershipId, role }: { membershipId: string; role: string }) {
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
      {ASSIGNABLE.map((r) => (
        <option key={r} value={r}>{r.toLowerCase()}</option>
      ))}
    </select>
  );
}

export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  return (
    <ActionForm action={removeMember} confirm={`Remove ${name} from this household?`}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50 px-2 py-1 text-sm">
        Remove
      </button>
    </ActionForm>
  );
}

export function MakeOwnerButton({ membershipId, name }: { membershipId: string; name: string }) {
  return (
    <ActionForm
      action={transferOwnership}
      confirm={`Make ${name} the owner? You'll step down to admin — this can't be undone by you afterwards.`}
    >
      <input type="hidden" name="membershipId" value={membershipId} />
      <button type="submit" className="btn-ghost px-2 py-1 text-sm hover:bg-[var(--hover)]">
        Make owner
      </button>
    </ActionForm>
  );
}

export function DeleteHouseholdButton() {
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
        if (!window.confirm("Delete this household and ALL its data for every member? This cannot be undone."))
          e.preventDefault();
      }}
    >
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50">
        Delete household
      </button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </form>
  );
}

export function CancelInviteButton({ id }: { id: string }) {
  return (
    <ActionForm action={cancelInvite}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50 px-2 py-1 text-sm">
        Cancel
      </button>
    </ActionForm>
  );
}

export function InviteResponse({ id }: { id: string }) {
  return (
    <div className="flex gap-2">
      <ActionForm action={acceptInvite}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-primary px-3 py-1 text-sm">Accept</button>
      </ActionForm>
      <ActionForm action={declineInvite}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-ghost border border-[var(--border)] px-3 py-1 text-sm">Decline</button>
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
      setMsg("Saved");
      router.refresh();
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label className="label">Household name</label>
        <input name="name" defaultValue={name} required className="input" />
      </div>
      <div>
        <label className="label">Reporting currency</label>
        <select name="baseCurrency" defaultValue={baseCurrency} className="input">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary"><Pending label="Save" busy="Saving…" /></button>
      {msg && <span className="text-sm text-green-600">{msg}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}

export function NewHouseholdForm() {
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
        <label className="label">New household name</label>
        <input name="name" required placeholder="e.g. Vacation Fund" className="input" />
      </div>
      <div>
        <label className="label">Currency</label>
        <select name="baseCurrency" className="input" defaultValue="USD">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-ghost border border-[var(--border)]">
        <Pending label="Create" busy="Creating…" />
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function LeaveHouseholdButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function action() {
    setError(null);
    const res = await leaveHousehold();
    if (res?.error) setError(res.error);
    else router.refresh();
  }
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm("Leave this household?")) e.preventDefault(); }}>
      <button type="submit" className="btn-ghost text-red-600 hover:bg-red-50">Leave household</button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </form>
  );
}
