// Test Connection logs in to CMS and out again. Where CMS keeps one session
// per account, that login ends the session of a connected host with the same
// address, port and CMS user, so the test is off while one is connected (the
// server refuses it too, HOST_CONNECTED).

const sameAddress = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** The connected host with the same address, port and CMS user as `target`, if any. */
export function connectedHostWithSameServer(hosts, authorizedHosts, target) {
  return (hosts || []).find((host) =>
    (authorizedHosts || []).includes(host.uid) &&
    sameAddress(host.address, target.address) &&
    String(host.port) === String(target.port) &&
    host.id === target.id
  );
}
