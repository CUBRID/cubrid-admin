import { Checkbox } from '../../../../components/ds/forms/Checkbox';
import { Input } from '../../../../components/ds/forms/Input';
import { SectionHeader } from '../../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../../constants/useCM';

export default function UnloadAdvancedOptions({ formData, handleInputChange }) {
  const CM = useCM();

  const isRefDisabled = formData.schemaScope !== 'selected';

  const optionFields = [
    { label: CM.prefixOutputFiles, name: 'prefixOutputFile', useName: 'usePrefixOutputFile', type: 'text' },
    { label: CM.fileForHash, name: 'fileForHash', useName: 'useFileForHash', type: 'text' },
    { label: CM.numCachedPages, name: 'cachedPages', useName: 'useCachedPages', type: 'number' },
    { label: CM.estimatedInstances, name: 'estimateInstances', useName: 'useEstimateInstances', type: 'number' },
    { label: CM.loFileCountPerDir, name: 'loFileDirectory', useName: 'useLoFileDirectory', type: 'text' },
  ];

  const handleCheckboxToggle = (e, useName, valueName) => {
    const isChecked = e.target.checked;
    handleInputChange(e);

    // Desktop CUBRID Manager defaults on checking
    if (isChecked) {
      if (useName === 'useCachedPages' && !formData.cachedPages) {
        handleInputChange({ target: { name: 'cachedPages', value: '100' } });
      }
      if (useName === 'usePrefixOutputFile' && !formData.prefixOutputFile) {
        handleInputChange({ target: { name: 'prefixOutputFile', value: formData.targetDbName || '' } });
      }
      if (useName === 'useFileForHash' && !formData.fileForHash) {
        handleInputChange({
          target: {
            name: 'fileForHash',
            value: formData.targetDirectory ? `${formData.targetDirectory}/hashfile` : '',
          },
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={CM.unloadOption} icon="tune" />

      <div className="space-y-3">
        <Checkbox
          name="useDelimitedIdentifier"
          label={CM.useDelimitedIdentifier}
          checked={formData.useDelimitedIdentifier}
          onChange={handleInputChange}
        />

        <Checkbox
          name="includeReferencedTables"
          label={CM.includeReferencedTables}
          checked={Boolean(formData.includeReferencedTables && !isRefDisabled)}
          onChange={handleInputChange}
          disabled={isRefDisabled}
        />
      </div>

      <div className="space-y-3 pt-2">
        {optionFields.map((field) => (
          <div key={field.name} className="grid grid-cols-1 sm:grid-cols-[280px_1fr] items-center gap-3">
            <Checkbox
              name={field.useName}
              checked={Boolean(formData[field.useName])}
              onChange={(e) => handleCheckboxToggle(e, field.useName, field.name)}
              label={field.label}
              className="w-full shrink-0"
            />
            <Input
              type={field.type}
              name={field.name}
              value={formData[field.name]}
              onChange={handleInputChange}
              disabled={!formData[field.useName]}
              size="md"
              className="w-full font-mono text-14"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
