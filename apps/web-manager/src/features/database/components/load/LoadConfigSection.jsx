import { Input } from '../../../../components/ds/forms/Input';
import { useCM } from '../../../../constants/useCM';
import {
  CaDialogField,
  CaDialogFieldGrid,
  CaDialogGroup,
} from '../../../../components/ds/layout/CaDialogLayout';

export default function LoadConfigSection({ formData, handleInputChange }) {
  const CM = useCM();
  return (
    <CaDialogGroup title={CM.grpDbInfo}>
      <CaDialogFieldGrid labelWidth="130px" className="pt-2 gap-y-3">
        <CaDialogField label={CM.targetDbName}>
          <Input
            name="targetDbName"
            value={formData.targetDbName}
            onChange={handleInputChange}
            disabled
            icon="database"
          />
        </CaDialogField>

        <CaDialogField label={CM.userName}>
          <Input
            name="dbUsername"
            value={formData.dbUsername}
            onChange={handleInputChange}
            icon="account_circle"
          />
        </CaDialogField>

        <CaDialogField label={CM.password}>
          <Input
            type="password"
            name="dbPassword"
            value={formData.dbPassword}
            onChange={handleInputChange}
            icon="lock"
          />
        </CaDialogField>
      </CaDialogFieldGrid>
    </CaDialogGroup>
  );
}
