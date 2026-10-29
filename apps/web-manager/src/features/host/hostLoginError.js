// Message for a failed host (CMS) login, in the UI language. The server's
// copy for the errors it raises itself is fixed English, so those are matched
// by their Problem Details `type` (not `code`: INVALID_TOKEN etc. are shared
// across kinds) and replaced with labels. Anything else — e.g. the CMS's own
// `note` for a rejected login — is the host's text and is passed through.
const CMS_NO_RESPONSE_TYPE = '/errors/cms/no_response';
const CMS_TLS_ERROR_TYPE = '/errors/cms/tls_error';

export function hostLoginErrorMessage(err, CM) {
  const apiData = err?.response?.data;
  const type = apiData?.data?.type || apiData?.type || '';
  if (type === CMS_NO_RESPONSE_TYPE) return CM.hostLoginNoResponseMsg;
  if (type === CMS_TLS_ERROR_TYPE) return CM.hostLoginTlsErrorMsg;
  return apiData?.message || apiData?.error || CM.hostLoginFailedMsg;
}
