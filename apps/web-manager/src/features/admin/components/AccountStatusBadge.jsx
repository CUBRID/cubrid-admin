import { Badge } from '../../../components/ds/foundation/Badge';
import { useCM } from '../../../constants/useCM';

/** Active, disabled, or a sign-up awaiting approval. */
export default function AccountStatusBadge({ status }) {
  const CM = useCM();
  if (status === 'pending') {
    return <Badge size="sm" variant="warning">{CM.accountStatusPending}</Badge>;
  }
  return (
    <Badge size="sm" variant={status === 'disabled' ? 'danger' : 'success'}>
      {status === 'disabled' ? CM.accountStatusDisabled : CM.accountStatusActive}
    </Badge>
  );
}
