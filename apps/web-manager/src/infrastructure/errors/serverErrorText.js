import { getCM, getStoredLocale } from '../../constants/useCM';

// A failed API request's message in the UI language. The server's own
// wording is fixed English; each error names itself with a Problem Details
// `type` (/errors/{kind}/{code}), sometimes a `reason`, and carries what it is
// about as fields (dbname, alias, ...). A locale pack with a `serverErrors`
// table, keyed by "{kind}/{code}", says these in its own words; without one
// (English) the server's message is shown as is. CMS's own text is kept and
// shown after the sentence; with no table entry it follows a general one.

// CMS ends some of its messages with a literal "<end>".
const cleanNote = (note) => String(note).replace(/\s*<end>\s*$/i, '').trim();

const originalOf = (apiData, data) =>
  apiData?.note || data?.message || data?.detail || data?.title || apiData?.message || '';

export function serverErrorText(apiData, CM) {
  const data = apiData?.data && typeof apiData.data === 'object' ? apiData.data : apiData;
  const original = cleanNote(originalOf(apiData, data));
  const table = CM.serverErrors;
  if (!table) return original || CM.requestFailedMsg;

  const key = typeof data?.type === 'string' ? data.type.replace(/^\/errors\//, '') : '';
  const entry = table[key];
  // A CMS failure's message is CMS's own text until the server sends it apart.
  const cmsNote = data?.cmsNote ? cleanNote(data.cmsNote) : (key.startsWith('cms/') ? original : '');
  if (entry === undefined) {
    if (cmsNote) return CM.cmsFailedWithNote(CM.cmsNotes?.[cmsNote] ?? cmsNote);
    return original ? CM.requestFailedWithDetail(original) : CM.requestFailedMsg;
  }
  const text = typeof entry === 'function' ? entry(data ?? {}) : entry;
  if (!cmsNote) return text;
  return `${text} (${CM.cmsNotes?.[cmsNote] ?? cmsNote})`;
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
