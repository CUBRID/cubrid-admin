import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { closeUnloadResultModal } from '../databaseSlice';
import { useCM } from '../../../constants/useCM';

import { Icon } from '../../../components/ds/foundation/Icon';

export default function UnloadResultModal() {
  const CM = useCM();
  const dispatch = useDispatch();
  const { isUnloadResultModalOpen, unloadResultData } = useSelector((state) => state.databaseUI, shallowEqual);

  if (!isUnloadResultModalOpen) return null;

  const resultData = unloadResultData?.[0] || {};
  const rows = Object.entries(resultData).map(([tableName, stats]) => ({
    tableName,
    stats,
  }));

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 bg-background-dark/40 backdrop-blur-xs animate-in fade-in duration-200 font-sans text-left">
      <div className="bg-white dark:bg-bk-side w-full max-w-[500px] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] relative text-left">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/60" />

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-background-dark/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Icon name="analytics" size="sm" weight={300} className="text-amber-500" />
            </div>
            <h3 className="text-sm font-medium text-slate-900 dark:text-white">{CM.unloadResultTitle}</h3>
          </div>
          <button
            type="button"
            onClick={() => dispatch(closeUnloadResultModal())}
            className="w-7 h-7 rounded-md hover:bg-slate-200 dark:hover:bg-white/5 text-slate-400 flex items-center justify-center"
          >
            <Icon name="close" size="sm" weight={300} />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <p className="text-13 text-slate-500">{CM.unloadResultMsg}</p>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-13 border-collapse">
              <thead className="bg-slate-50 dark:bg-background-dark/50 text-12 font-medium text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-2">{CM.classLabel}</th>
                  <th className="px-4 py-2 text-right">{CM.resultLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono text-13">
                {rows.length > 0 ? (
                  rows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{row.tableName}</td>
                      <td className="px-4 py-2 text-right text-amber-600">{row.stats}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-4 py-12 text-center text-slate-400 text-12">
                      {CM.noResultsLabel}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-background-dark/80 flex justify-end border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => dispatch(closeUnloadResultModal())}
            className="px-8 py-1.5 bg-amber-500 hover:bg-[#ffd700] text-bk-side text-13 font-medium rounded-sm border border-amber-500/50 min-w-[120px]"
          >
            {CM.close}
          </button>
        </div>
      </div>
    </div>
  );
}
