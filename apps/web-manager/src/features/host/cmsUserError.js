// Message for a failed CMS user operation (add, update, delete, set
// password), in the UI language. The server refuses user management on a
// host not connected as the CMS admin account; that is matched by the
// error's Problem Details `type` and replaced with a label. Anything else is
// the server's or the host's own text and is passed through.
const CMS_ADMIN_REQUIRED_TYPE = '/errors/resource/cms_admin_required';

export function cmsUserErrorMessage(err, CM, fallback) {
  const apiData = err?.response?.data;
  const type = apiData?.data?.type || apiData?.type || '';
  if (type === CMS_ADMIN_REQUIRED_TYPE) return CM.cmsAdminRequiredErrorMsg;
  return apiData?.message || apiData?.error || fallback;
}
