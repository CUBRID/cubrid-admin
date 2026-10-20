// No `err.response` means the request never got a reply at all (timeout,
// dropped connection) - the action may or may not have gone through on the
// CMS/server side, so callers shouldn't just assume it failed. Used to decide
// whether a failed mutation should trigger a refetch of the affected list/status
// instead of retrying the (possibly non-idempotent) action itself.
export const isAmbiguousFailure = (err) => !err.response;
