import { Input } from '../../../../components/ds/forms/Input';
import { SectionHeader } from '../../../../components/ds/foundation/SectionHeader';
import { useCM } from '../../../../constants/useCM';

export default function UnloadConfigSection({ formData, handleInputChange }) {
  const CM = useCM();
  return (
    <div className="space-y-4">
      <SectionHeader title={CM.grpDbInfo} icon="database" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label={CM.targetDbName} value={formData.targetDbName} disabled size="md" />
        <Input
          label={CM.targetDirectory}
          name="targetDirectory"
          value={formData.targetDirectory}
          onChange={handleInputChange}
          size="md"
        />
        <Input
          label={CM.userName}
          name="dbUsername"
          value={formData.dbUsername}
          onChange={handleInputChange}
          icon="account_circle"
          size="md"
        />
        <Input
          label={CM.password}
          type="password"
          name="dbPassword"
          value={formData.dbPassword}
          onChange={handleInputChange}
          icon="lock"
          size="md"
        />
      </div>
    </div>
  );
}
