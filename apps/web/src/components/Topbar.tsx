export function Topbar({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    // Wraps on a phone: title and its action button side by side left no room
    // for either, so the action dropped onto its own line squashed. `min-w-0`
    // lets a long title truncate rather than push the action off-screen.
    <header className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
