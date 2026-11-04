import { useMemo } from 'react';
import { Checkbox } from '../../../../components/ds/forms/Checkbox';
import { RadioGroup } from '../../../../components/ds/forms/Radio';
import { SectionHeader } from '../../../../components/ds/foundation/SectionHeader';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Spinner } from '../../../../components/ds/foundation/Spinner';
import { useCM } from '../../../../constants/useCM';

export default function UnloadContentSection({
  formData,
  handleSchemaScopeChange,
  handleDataScopeChange,
  handleTableToggle,
  handleSelectAllTables,
  dynamicTables,
  isTablesLoading,
}) {
  const CM = useCM();

  const schemaOptions = useMemo(() => [
    { label: CM.all, value: 'all' },
    { label: CM.selectedTables, value: 'selected' },
    { label: CM.notInclude, value: 'none' },
  ], [CM]);

  const dataOptions = useMemo(() => [
    { label: CM.selectedTables, value: 'selected' },
    { label: CM.notInclude, value: 'none' },
  ], [CM]);

  const isInvalidScope = formData.schemaScope === 'none' && formData.dataScope === 'none';
  const isTableDisabled = formData.schemaScope !== 'selected' && formData.dataScope !== 'selected';

  return (
    <div className="space-y-6">
      <SectionHeader title={CM.unloadTarget} icon="unfold_more" />

      {isInvalidScope && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-lg text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-base">warning</span>
          {CM.selectAtLeastOneScope}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Schema Group */}
        <div className="p-3 border border-slate-200 dark:border-white/10 rounded-lg space-y-3">
          <SectionHeader title={CM.schema} icon="schema" />
          <RadioGroup
            name="schemaScope"
            options={schemaOptions}
            value={formData.schemaScope}
            onChange={handleSchemaScopeChange}
          />
        </div>

        {/* Data Group */}
        <div className="p-3 border border-slate-200 dark:border-white/10 rounded-lg space-y-3">
          <SectionHeader title={CM.data} icon="dataset" />
          <RadioGroup
            name="dataScope"
            options={dataOptions}
            value={formData.dataScope}
            onChange={handleDataScopeChange}
          />
        </div>
      </div>

      {/* Schema Table / Class Selection List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader
            title={CM.availableClasses}
            icon="table_rows"
            badge={dynamicTables.length}
          />
          {!isTablesLoading && dynamicTables.length > 0 && !isTableDisabled && (
            <Checkbox
              label={CM.selectAll}
              checked={dynamicTables.length > 0 && formData.selectedTables.length === dynamicTables.length}
              indeterminate={formData.selectedTables.length > 0 && formData.selectedTables.length < dynamicTables.length}
              onChange={() => handleSelectAllTables(dynamicTables)}
              disabled={isTableDisabled}
            />
          )}
        </div>
        {isTablesLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className={`max-h-[160px] overflow-y-auto border border-slate-200 dark:border-white/10 rounded-lg divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-white/[0.02] ${isTableDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {dynamicTables.map((table) => (
              <div
                key={table}
                className="flex items-center px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <Checkbox
                  label={table}
                  checked={formData.selectedTables.includes(table)}
                  onChange={() => handleTableToggle(table)}
                  disabled={isTableDisabled}
                />
              </div>
            ))}
          </div>
        )}
        {dynamicTables.length === 0 && !isTablesLoading && (
          <Typography variant="caption" className="text-slate-500">
            {CM.noTablesAvailableMsg}
          </Typography>
        )}
      </div>
    </div>
  );
}
