import { Checkbox } from '../../../../components/ds/forms/Checkbox';
import { Input } from '../../../../components/ds/forms/Input';
import { useCM } from '../../../../constants/useCM';
import {
  CaDialogField,
  CaDialogFieldGrid,
  CaDialogGroup,
} from '../../../../components/ds/layout/CaDialogLayout';

export default function LoadOptionsSection({ formData, handleCheckBoxChange, handleValueChange }) {
  const CM = useCM();

  return (
    <CaDialogGroup title={CM.loadOption}>
      <CaDialogFieldGrid labelWidth="280px" className="pt-2 gap-y-4">
        {/* Check syntax and load database */}
        <CaDialogField fullWidth>
          <Checkbox
            checked={formData.checkBoxes.checkoption}
            onChange={(e) => handleCheckBoxChange('checkoption', e.target.checked)}
            label={CM.checkSyntaxAndLoad}
          />
        </CaDialogField>

        {/* No log */}
        <CaDialogField fullWidth>
          <Checkbox
            checked={formData.checkBoxes.nolog}
            onChange={(e) => handleCheckBoxChange('nolog', e.target.checked)}
            label={CM.noLog}
          />
        </CaDialogField>

        {/* Estimated number of instances */}
        <CaDialogField
          label={
            <div className="flex items-center gap-1.5 py-1">
              <Checkbox
                checked={formData.checkBoxes.estimated}
                onChange={(e) => handleCheckBoxChange('estimated', e.target.checked)}
                label={CM.estimatedInstances}
              />
            </div>
          }
        >
          <Input
            type="number"
            value={formData.values.estimated}
            onChange={(e) => handleValueChange('estimated', e.target.value)}
            disabled={!formData.checkBoxes.estimated}
            placeholder="5000"
            className="font-mono text-13"
          />
        </CaDialogField>

        {/* Insertion count for periodic commit */}
        <CaDialogField
          label={
            <div className="flex items-center gap-1.5 py-1">
              <Checkbox
                checked={formData.checkBoxes.period}
                onChange={(e) => handleCheckBoxChange('period', e.target.checked)}
                label={CM.insertionCountPeriodicCommit}
              />
            </div>
          }
        >
          <Input
            type="number"
            value={formData.values.period}
            onChange={(e) => handleValueChange('period', e.target.value)}
            disabled={!formData.checkBoxes.period}
            placeholder="10000"
            className="font-mono text-13"
          />
        </CaDialogField>

        {/* Don't use OID */}
        <CaDialogField fullWidth>
          <Checkbox
            checked={formData.checkBoxes.oiduse}
            onChange={(e) => handleCheckBoxChange('oiduse', e.target.checked)}
            label={CM.dontUseOid}
          />
        </CaDialogField>

        {/* Don't update statistics */}
        <CaDialogField fullWidth>
          <Checkbox
            checked={formData.checkBoxes.statisticsuse}
            onChange={(e) => handleCheckBoxChange('statisticsuse', e.target.checked)}
            label={CM.dontUpdateStatistics}
          />
        </CaDialogField>

        {/* Using error control file */}
        <CaDialogField
          label={
            <div className="flex items-center gap-1.5 py-1">
              <Checkbox
                checked={formData.checkBoxes.errorcontrolfile}
                onChange={(e) => handleCheckBoxChange('errorcontrolfile', e.target.checked)}
                label={CM.usingErrorControlFile}
              />
            </div>
          }
        >
          <Input
            type="text"
            value={formData.values.errorcontrolfile}
            onChange={(e) => handleValueChange('errorcontrolfile', e.target.value)}
            disabled={!formData.checkBoxes.errorcontrolfile}
            placeholder="e.g. /path/to/error.err"
            className="font-mono text-13"
          />
        </CaDialogField>

        {/* Ignored table file */}
        <CaDialogField
          label={
            <div className="flex items-center gap-1.5 py-1">
              <Checkbox
                checked={formData.checkBoxes.ignoreclassfile}
                onChange={(e) => handleCheckBoxChange('ignoreclassfile', e.target.checked)}
                label={CM.ignoredTableFile}
              />
            </div>
          }
        >
          <Input
            type="text"
            value={formData.values.ignoreclassfile}
            onChange={(e) => handleValueChange('ignoreclassfile', e.target.value)}
            disabled={!formData.checkBoxes.ignoreclassfile}
            placeholder="e.g. /path/to/ignore.txt"
            className="font-mono text-13"
          />
        </CaDialogField>
      </CaDialogFieldGrid>
    </CaDialogGroup>
  );
}
