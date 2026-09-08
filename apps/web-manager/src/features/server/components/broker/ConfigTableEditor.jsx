import React from 'react';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Input } from '../../../../components/ds/forms/Input';
import { Toggle } from '../../../../components/ds/forms/Toggle';
import { StatusBadge } from '../../../../components/ds/foundation/StatusBadge';
import { useCM } from '../../../../constants/useCM';

function isBool(val = '') {
  const u = val.toUpperCase();
  return u === 'ON' || u === 'OFF' || val === 'yes' || val === 'no';
}

export default function ConfigTableEditor({
  sections,
  allPropertyKeys,
  selectedCell,
  setSelectedCell,
  handleKeyChange,
  handleValueChange,
}) {
  const CM = useCM();
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
        <div className="block w-full">

          {/* Sticky header */}
          <div className="sticky top-0 z-20 flex w-full bg-slate-50 dark:bg-[#0D1117] border-b border-slate-200 dark:border-white/8">
            <div className="w-80 shrink-0 px-4 py-2.5 border-r border-slate-200 dark:border-white/8 text-12 font-bold uppercase tracking-widest text-slate-400">
              {CM.propertyLabel}
            </div>
            {sections.map((sec, idx) => (
              <div key={idx} className="w-full min-w-0 px-4 py-2.5 border-r border-slate-200 dark:border-white/8 flex items-center gap-1.5">
                <Icon name="hub" size="sm" weight={300} className="text-amber-500 dark:text-bk-yellow shrink-0" />
                <span className="text-12 font-bold uppercase tracking-widest text-amber-600 dark:text-bk-yellow truncate">
                  {sec.properties?.BROKER_NAME || CM.brokerNumberFallback(idx + 1)}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="bg-white dark:bg-bk-side w-full">
            {allPropertyKeys.map((key, rowIdx) => {
              const isBrokerName = key === 'BROKER_NAME';
              const isRowSelected = selectedCell.row === rowIdx;

              return (
                <div
                  key={rowIdx}
                  className="flex border-b border-slate-100 dark:border-white/4 transition-colors"
                >
                  {/* Key cell */}
                  <div className={`w-80 shrink-0 flex items-center border-r border-slate-100 dark:border-white/5`}>
                    {isBrokerName ? (
                      <div className="flex items-center gap-2 px-4 py-2">
                        <Icon name="label_important" size="sm" weight={300} className="text-sky-500" />
                        <span className="text-14 font-bold text-sky-600 dark:text-sky-400 font-mono">{key}</span>
                      </div>
                    ) : (
                      <div className={`w-full h-full flex items-center ${isRowSelected && selectedCell.col === -1 ? 'ring-1 ring-inset ring-amber-500/60 transition-all z-10' : ''}`}
                           onClick={() => setSelectedCell({ row: rowIdx, col: -1 })}>
                        <Input
                          size="sm"
                          value={key}
                          onChange={(e) => handleKeyChange(key, e.target.value)}
                          className="w-full gap-0"
                          inputClassName="border-none bg-transparent rounded-none! font-mono text-14! px-4! focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Value cells */}
                  {sections.map((sec, colIdx) => {
                    const isSelected = selectedCell.row === rowIdx && selectedCell.col === colIdx;
                    const val = sec.properties[key] ?? '';
                    const bool = isBool(val);
                    const isActive = val.toUpperCase() === 'ON' || val === 'yes';
                    const isYesNo = val === 'yes' || val === 'no';

                    return (
                      <div
                        key={colIdx}
                        onClick={() => setSelectedCell({ row: rowIdx, col: colIdx })}
                        className={`relative w-full min-w-0 border-r border-slate-100 dark:border-white/5 cursor-pointer transition-all bg-transparent dark:bg-transparent
                          ${isSelected && !bool ? 'ring-1 ring-inset ring-amber-500/60 z-10 shadow-inner' : ''}
                          ${!bool ? 'hover:bg-amber-50/20 dark:hover:bg-white/2' : ''}`}
                      >
                        {bool ? (
                          <div className="flex items-center gap-2 px-4 h-[38px]">
                            <Toggle
                              checked={isActive}
                              onChange={(checked) => {
                                const next = isYesNo ? (checked ? 'yes' : 'no') : (checked ? 'ON' : 'OFF');
                                handleValueChange(colIdx, key, next);
                              }}
                            />
                            <span className={`text-13 font-mono font-bold ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                              {val}
                            </span>
                          </div>
                        ) : (
                          <Input
                            size="sm"
                            value={val}
                            onChange={(e) => handleValueChange(colIdx, key, e.target.value)}
                            className="w-full gap-0"
                            inputClassName={`border-none bg-transparent rounded-none! font-mono text-14! px-4! focus:outline-none
                              ${isSelected ? 'text-amber-600 dark:text-bk-yellow font-bold' : ''}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-1.5 bg-white dark:bg-bk-side border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-12 text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
        <span>{CM.propertiesBrokersCountLabel(allPropertyKeys.length, sections.length)}</span>
        <StatusBadge label={CM.tableEditor} variant="emerald" className="border-none bg-transparent" />
      </div>
    </div>
  );
}
