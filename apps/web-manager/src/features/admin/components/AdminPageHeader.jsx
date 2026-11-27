/** A section's title, one line on what it is for, and its main action. */
export default function AdminPageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-14 text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
