import { useRef } from 'react';
import { Select } from '../../../../components/ds/forms/Select';
import { Checkbox } from '../../../../components/ds/forms/Checkbox';
import { Input } from '../../../../components/ds/forms/Input';
import { Typography } from '../../../../components/ds/foundation/Typography';
import { Icon } from '../../../../components/ds/foundation/Icon';
import { Radio } from '../../../../components/ds/forms/Radio';
import { useCM } from '../../../../constants/useCM';
import {
  CaDialogField,
  CaDialogFieldGrid,
  CaDialogGroup,
  CaDialogTable,
} from '../../../../components/ds/layout/CaDialogLayout';

const typeIcon = { schema: 'code', object: 'dataset', index: 'layers', trigger: 'bolt' };

// Long paths get clipped by the column width — let the user click-and-drag
// across the text to pan it sideways instead of only relying on the title tooltip.
const DraggablePath = ({ value }) => {
  const ref = useRef(null);
  const drag = useRef(null);

  const handleMouseDown = (e) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
  };

  const handleMouseMove = (e) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const delta = e.clientX - drag.current.startX;
    if (Math.abs(delta) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScrollLeft - delta;
  };

  const stopDrag = () => {
    drag.current = null;
  };

  return (
    <span
      ref={ref}
      title={value}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      className="font-mono text-13 text-slate-500 dark:text-slate-400 block max-w-[260px] overflow-x-auto whitespace-nowrap cursor-grab active:cursor-grabbing select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {value}
    </span>
  );
};

const TypeBadge = ({ value }) => (
  <div className="flex items-center gap-2">
    <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
      <Icon name={typeIcon[value] || 'description'} size="12px" weight={500} className="text-amber-500" />
    </div>
    <Typography variant="caption" className="font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-12">
      {value}
    </Typography>
  </div>
);

export default function LoadSourceSection({
  radio,
  setRadio,
  selectedUnload,
  handleUnloadSelectChange,
  unloadList,
  dataSource,
  handleTableCheckboxChange,
  formData,
  handleCheckBoxChange,
  handleUnloadPathChange
}) {
  const CM = useCM();

  const columns = [
    {
      header: CM.loadType,
      accessor: 'loadType',
      width: '160px',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <Checkbox
            checked={row.checked}
            disabled={radio !== 0}
            onChange={(e) => handleTableCheckboxChange(e.target.checked, row.key)}
          />
          <TypeBadge value={value} />
        </div>
      )
    },
    {
      header: CM.path,
      accessor: 'path',
      render: (value) => <DraggablePath value={value} />
    },
    {
      header: CM.date,
      accessor: 'date',
      width: '175px',
      align: 'right',
      render: (value) => (
        <span className="font-mono text-13 text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
          {value}
        </span>
      )
    }
  ];

  return (
    <CaDialogGroup title={CM.unloadedFiles}>
      <div className="space-y-4 pt-1">
        {/* Option 0: Select from list */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center">
              <Radio
                name="loadSourceRadio"
                value={0}
                checked={radio === 0}
                onChange={() => setRadio(0)}
                label={CM.selectFromList}
              />
            </div>
            <div className="flex-1">
              <Select
                value={selectedUnload}
                onChange={(e) => handleUnloadSelectChange(e.target.value)}
                placeholder="Select source database"
                options={unloadList.map(db => ({ value: db.dbname, label: db.dbname }))}
                icon="database"
                disabled={radio !== 0}
              />
            </div>
          </div>

          <div className={`transition-all duration-200 ${radio !== 0 ? 'opacity-40 pointer-events-none' : ''}`}>
            <CaDialogTable
              columns={columns}
              data={dataSource}
              emptyMessage="No backup volumes found for this database"
            />

            {radio === 0 && dataSource.length > 0 && (
              <p className="text-12 text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5 mt-2 pl-1">
                <Icon name="check_box_outline_blank" size="12px" className="text-amber-500/60" />
                {dataSource.filter(d => d.checked).length} of {dataSource.length} volumes selected
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200/60 dark:border-white/[0.04]" />

        {/* Option 1: Select from system path */}
        <div className="space-y-3">
          <div className="mb-2">
            <Radio
              name="loadSourceRadio"
              value={1}
              checked={radio === 1}
              onChange={() => setRadio(1)}
              label={CM.selectFromLocal}
            />
          </div>

          <div className={`pl-6 space-y-3 transition-all duration-200 ${radio !== 1 ? 'opacity-40 pointer-events-none' : ''}`}>
            <CaDialogFieldGrid labelWidth="150px">
              {[
                { type: 'schema', label: CM.loadSchema },
                { type: 'object', label: CM.loadObject },
                { type: 'index', label: CM.loadIndex },
                { type: 'trigger', label: CM.loadTrigger },
              ].map(({ type, label }) => {
                const isEnabled = formData.checkBoxes[type] && radio === 1;
                return (
                  <CaDialogField
                    key={type}
                    label={
                      <div className="flex items-center gap-1.5 py-1">
                        <Checkbox
                          checked={formData.checkBoxes[type]}
                          disabled={radio !== 1}
                          onChange={(e) => handleCheckBoxChange(type, e.target.checked)}
                          label={label}
                        />
                      </div>
                    }
                  >
                    <Input
                      value={formData.unloadFiles[type]}
                      onChange={(e) => handleUnloadPathChange(type, e.target.value)}
                      disabled={!isEnabled}
                      placeholder="/absolute/path/to/file"
                      icon={typeIcon[type]}
                      className="font-mono!"
                    />
                  </CaDialogField>
                );
              })}
            </CaDialogFieldGrid>
          </div>
        </div>
      </div>
    </CaDialogGroup>
  );
}
