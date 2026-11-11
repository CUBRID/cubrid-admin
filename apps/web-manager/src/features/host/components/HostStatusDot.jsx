import React from 'react';
import {
  HOST_CONNECTED, HOST_DISCONNECTED, HOST_LOGGING_IN, HOST_LOGIN_FAILED, HOST_NOT_RESPONDING,
} from '../hostConnectionStatus';

const DOT_COLOR = {
  [HOST_CONNECTED]: 'bg-emerald-500',
  [HOST_LOGGING_IN]: 'bg-amber-500 animate-pulse',
  [HOST_LOGIN_FAILED]: 'bg-rose-500',
  [HOST_DISCONNECTED]: 'bg-rose-500',
  [HOST_NOT_RESPONDING]: 'bg-rose-500',
};

/**
 * Green connected, yellow not logged in (blinking while logging in), red
 * login failed, connection lost or CMS not responding. `ping` adds the sidebar's ripple to green.
 */
export function HostStatusDot({ status, text, ping = false, className = '' }) {
  const color = DOT_COLOR[status] ?? 'bg-amber-500';
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      data-testid="host-status-dot"
      data-status={status}
      className={`relative inline-flex size-1.5 shrink-0 ${className}`}
    >
      {ping && status === HOST_CONNECTED && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 bg-emerald-400" />
      )}
      <span className={`relative inline-flex size-1.5 rounded-full ${color}`} />
    </span>
  );
}
