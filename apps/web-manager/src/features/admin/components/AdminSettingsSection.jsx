import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Badge } from '../../../components/ds/foundation/Badge';
import { Icon } from '../../../components/ds/foundation/Icon';
import { Toggle } from '../../../components/ds/forms/Toggle';
import { useCM } from '../../../constants/useCM';
import { requestErrorText } from '../../../infrastructure/errors/serverErrorText';
import { showStatusModal } from '../../layout/layoutSlice';
import { adminApi } from '../adminApi';
import AdminPageHeader from './AdminPageHeader';

const CARD = 'rounded-2xl border border-slate-200/70 dark:border-white/6 bg-white dark:bg-background-dark p-5';

/** Self-registration (and why it is open or closed), and the cwm.conf admins. */
export default function AdminSettingsSection({ reloadKey }) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setError(null);
    adminApi
      .getSettings()
      .then((s) => live && setSettings(s ?? null))
      .catch((err) => live && setError(requestErrorText(err, CM)));
    return () => {
      live = false;
    };
    // CM: only the error's wording, not a reason to read again.
  }, [reloadKey]);

  const save = async (request) => {
    setSaving(true);
    try {
      setSettings(await request());
    } catch (err) {
      dispatch(showStatusModal({ type: 'error', title: CM.operationFailed, message: requestErrorText(err, CM) }));
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div>
        <AdminPageHeader title={CM.adminSectionSettings} subtitle={CM.settingsPageSubtitle} />
        <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/15 rounded-xl">
          <Icon name="error_outline" size="sm" weight={300} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-13 text-rose-500 font-medium flex-1 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="max-w-3xl">
        <AdminPageHeader title={CM.adminSectionSettings} subtitle={CM.settingsPageSubtitle} />
        <div className="h-24 rounded-2xl bg-slate-100 dark:bg-white/5 animate-pulse" />
      </div>
    );
  }

  const source = {
    admin: CM.registrationSourceAdmin,
    config: CM.registrationSourceConfig,
    auto: CM.registrationSourceAuto,
  }[settings.registrationSource] ?? CM.registrationSourceAuto;
  const approvalSource = {
    admin: CM.registrationSourceAdmin,
    config: CM.registrationApprovalSourceConfig,
    auto: CM.registrationApprovalSourceAuto,
  }[settings.registrationApprovalSource] ?? CM.registrationApprovalSourceAuto;

  return (
    <div className="max-w-3xl space-y-4">
      <AdminPageHeader title={CM.adminSectionSettings} subtitle={CM.settingsPageSubtitle} />
      <div className={`${CARD} flex items-start justify-between gap-6`}>
        <div className="min-w-0">
          <p className="text-15 font-bold text-slate-700 dark:text-slate-200">{CM.selfRegistrationLabel}</p>
          <p className="text-13 text-slate-400 mt-1">{CM.selfRegistrationHint}</p>
          <p className="text-12 text-slate-500 mt-2 flex items-center gap-1.5" data-testid="admin-registration-source">
            <Icon name="info" size="14px" weight={300} />
            {source}
          </p>
        </div>
        <Toggle
          testId="admin-registration-toggle"
          checked={settings.registrationEnabled}
          onChange={(enabled) => save(() => adminApi.setRegistrationEnabled(enabled))}
          disabled={saving}
        />
      </div>

      <div className={`${CARD} flex items-start justify-between gap-6`} data-testid="admin-registration-approval">
        <div className="min-w-0">
          <p className="text-15 font-bold text-slate-700 dark:text-slate-200">{CM.registrationApprovalLabel}</p>
          <p className="text-13 text-slate-400 mt-1">{CM.registrationApprovalHint}</p>
          <p className="text-12 text-slate-500 mt-2 flex items-center gap-1.5" data-testid="admin-registration-approval-source">
            <Icon name="info" size="14px" weight={300} />
            {approvalSource}
          </p>
        </div>
        <Toggle
          testId="admin-registration-approval-toggle"
          checked={settings.registrationApproval !== false}
          onChange={(required) => save(() => adminApi.setRegistrationApproval(required))}
          disabled={saving}
        />
      </div>

      <div className={CARD} data-testid="admin-configured-admins">
        <p className="text-15 font-bold text-slate-700 dark:text-slate-200">{CM.configuredAdminsTitle}</p>
        <p className="text-13 text-slate-400 mt-1">{CM.configuredAdminsHint}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {settings.configuredAdmins?.length ? (
            settings.configuredAdmins.map((id) => (
              <Badge key={id} variant="warning">{id}</Badge>
            ))
          ) : (
            <span className="text-13 text-slate-400">{CM.noConfiguredAdmins}</span>
          )}
        </div>
      </div>
    </div>
  );
}
