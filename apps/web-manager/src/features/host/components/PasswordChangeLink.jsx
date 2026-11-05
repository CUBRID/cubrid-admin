import { useCM } from '../../../constants/useCM';

/**
 * "Change" at the right end of a saved password's label: opens the field to
 * type a new password, and "Keep current" closes it again. Goes in the
 * field's labelAction.
 */
export default function PasswordChangeLink({ active, onChange, disabled = false, testId }) {
  const CM = useCM();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onChange(!active)}
      className="text-12 font-semibold text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 disabled:no-underline"
    >
      {active ? CM.keepCurrentPassword : CM.changeLink}
    </button>
  );
}
