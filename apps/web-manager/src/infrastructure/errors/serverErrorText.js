import { getCM, getStoredLocale } from '../../constants/useCM';

// A failed API request's message in the UI language. The server's own
// wording is fixed English; each error names itself with a Problem Details
// `type` (/errors/{kind}/{code}), sometimes a `reason`, and carries what it is
// about as fields (dbname, alias, ...). A locale pack with a `serverErrors`
// table, keyed by "{kind}/{code}" or "{kind}/{code}:{reason}", says these in
// its own words; without one (English) the server's message is shown as is.
// CMS's own text is kept and shown after the sentence; with no table entry it
// follows a general one.

// CMS ends some of its messages with a literal "<end>".
const cleanNote = (note) => String(note).replace(/\s*<end>\s*$/i, '').trim();

// CMS's own text in the UI language: by its exact wording, then by a
// pattern for text with names or paths in it; otherwise as CMS sent it.
function cmsNoteText(note, CM) {
  const exact = CM.cmsNotes?.[note];
  if (exact !== undefined) return exact;
  for (const [pattern, say] of CM.cmsNotePatterns ?? []) {
    const match = pattern.exec(note);
    if (match) return say(match);
  }
  return note;
}

const originalOf = (apiData, data) =>
  apiData?.note || data?.message || data?.detail || data?.title || apiData?.message || '';

// Types whose server message is either this fixed sentence or a specific one
// (which field, which group, ...). A server that does not send a reason or
// field list for it yet only says the specific case in English, so that
// sentence is kept after the general one.
const SERVER_FIXED_TEXT = {
  'cms/tls_error': "Could not establish a trusted connection to CMS. Check the CMS server's TLS certificate.",
  'validation/invalid_request_body': 'The request body is invalid.',
  'validation/missing_required_field': 'Required field(s) are missing.',
  'validation/invalid_field_format': 'The field format is invalid.',
  'validation/unknown': 'Please check your input.',
  'resource/invalid_format': 'Invalid host information format.',
  'database/invalid_parameter': 'A database operation failed.',
  'database/invalid_volume_string': 'Invalid volume information.',
  'database/invalid_volume_format': 'Invalid volume information.',
  'database/invalid_volume_info': 'Invalid volume information.',
  'database/invalid_volume_size': 'Invalid volume information.',
  'database/parse_volume_failed': 'Invalid volume information.',
  'database/convert_volume_failed': 'Invalid volume information.',
  'database/duplicated_file': 'File already exists.',
  'config/server_param_not_found': 'Server parameter not found.',
  'config/no_conflist_data': 'Configuration data not found.',
  'config/no_confdata': 'Configuration data not found.',
  'config/dbname_already_exists': 'Database name already exists.',
  'config/dbname_not_found': 'Database name not found.',
  'config/get_all_sys_param_failed': 'Failed to retrieve system parameters.',
  'config/set_sys_param_failed': 'Failed to set system parameters.',
  'config/changed_since_loaded': 'The file was changed after it was opened.',
  'config/unknown': 'A configuration operation failed.',
};

export function serverErrorText(apiData, CM) {
  const data = apiData?.data && typeof apiData.data === 'object' ? apiData.data : apiData;
  const original = cleanNote(originalOf(apiData, data));
  const table = CM.serverErrors;
  if (!table) return original || CM.requestFailedMsg;

  const key = typeof data?.type === 'string' ? data.type.replace(/^\/errors\//, '') : '';
  const byReason = data?.reason !== undefined ? table[`${key}:${data.reason}`] : undefined;
  const entry = byReason ?? table[key];
  // Before the server sent CMS's text apart, a CMS failure's message was it.
  const fromCmsOnly = (key === 'cms/request_failed' || key === 'cms/unknown')
    && data?.reason === undefined && data?.cmsTask === undefined;
  const cmsNote = data?.cmsNote ? cleanNote(data.cmsNote) : (fromCmsOnly ? original : '');
  if (entry === undefined) {
    if (cmsNote) return CM.cmsFailedWithNote(cmsNoteText(cmsNote, CM));
    return original ? CM.requestFailedWithDetail(original) : CM.requestFailedMsg;
  }
  const failure = (inner) => failureText(inner, CM);
  const text = typeof entry === 'function' ? entry(data ?? {}, failure) : entry;
  if (cmsNote) return `${text} (${cmsNoteText(cmsNote, CM)})`;
  if (!(key in SERVER_FIXED_TEXT) || byReason !== undefined || !original || original === SERVER_FIXED_TEXT[key]) {
    return text;
  }
  // An entry that put the error's own values (field, path, ...) in its
  // sentence already says the specific case.
  const saysValues = typeof entry === 'function' && text !== entry({}, failure);
  return saysValues ? text : `${text} (${original})`;
}

/**
 * The message for a failed request, as a thunk or component reports it: the
 * one apiClient already put in the UI language, also when no response came
 * back at all.
 */
export function requestErrorText(err, CM = getCM(getStoredLocale())) {
  if (typeof err === 'string') return err;
  return err?.response?.data?.message || err?.message || CM.requestFailedMsg;
}

/**
 * A failure the server reports inside a successful response (a bulk or
 * service step, a database-creation step, a job's error): the same type and
 * fields as an error response, with its English sentence in `error` or
 * `message`. One without a type is shown as given.
 */
export function failureText(failure, CM = getCM(getStoredLocale())) {
  if (failure == null) return '';
  if (typeof failure !== 'object') return String(failure);
  const sentence = failure.message ?? (typeof failure.error === 'string' ? failure.error : '');
  if (typeof failure.type !== 'string') return sentence;
  return serverErrorText({ ...failure, message: sentence }, CM);
}

/** A job warning (warnings[i]) by its code in warningDetails[i]. */
export function warningText(warning, detail, CM = getCM(getStoredLocale())) {
  const entry = detail?.code ? CM.jobWarnings?.[detail.code] : undefined;
  return entry ? entry(detail) : warning;
}
