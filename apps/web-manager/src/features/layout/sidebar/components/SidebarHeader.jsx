import { Icon } from '../../../../components/ds/foundation/Icon';
import { useCM } from '../../../../constants/useCM';

export default function SidebarHeader() {
  const CM = useCM();
  return (
    <div className="flex items-center h-14 gap-2.5 px-4 border-b border-slate-200 dark:border-white/6 bg-white dark:bg-bk-side shrink-0 select-none">
      
      {/* Logo */}
      <div className="relative w-7 h-7 rounded-md bg-white dark:bg-white/[0.07] border border-slate-200 dark:border-white/10 shadow-xs flex items-center justify-center p-1 shrink-0">
        <img src="/cubrid-logo.png" alt={CM.cubridLogoAlt} className="w-full h-full object-contain" />
      </div>

      {/* Branding */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-15 font-black text-slate-800 dark:text-slate-100 tracking-tight">
            CUBRID
          </span>
          <span className="text-11 font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-sm px-1 py-0.5 leading-none uppercase tracking-wider">
            {CM.admin}
          </span>
        </div>
        <span className="text-11 font-semibold text-slate-400 dark:text-slate-600 leading-none uppercase tracking-[0.15em] mt-1">
          {CM.managerConsole}
        </span>
      </div>

      {/* Live status dot */}
      <div className="shrink-0 flex items-center gap-1 text-11 text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest">
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
        </span>
      </div>

    </div>
  );
}

