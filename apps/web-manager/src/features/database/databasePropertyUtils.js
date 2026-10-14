/**
 * Return configuration keys whose draft value differs from the value loaded
 * when the database property dialog opened.
 */
export function getModifiedKeys(initialParams = {}, params = {}) {
  return Object.keys({ ...initialParams, ...params })
    .filter(key => initialParams[key] !== params[key]);
}
