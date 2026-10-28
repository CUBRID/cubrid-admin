import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/apiClient', () => ({ default: { get: vi.fn() } }));

import apiClient from '../../api/apiClient';
import {
  dismissUpdate,
  fetchStartupUpdateNotice,
  fetchUpdateStatus,
  isTrustedDownloadUrl,
  openUpdateUrl,
} from './updateCheckClient';

const status = {
  currentVersion: '0.1.0-alpha.1',
  lastCheckedAt: '2026-10-26T00:00:00.000Z',
  result: { status: 'up-to-date' },
};

describe('updateCheckClient', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    delete window.desktopBridge;
  });

  afterEach(() => {
    delete window.desktopBridge;
    vi.restoreAllMocks();
  });

  describe('isTrustedDownloadUrl', () => {
    it('only trusts https GitHub hosts', () => {
      expect(isTrustedDownloadUrl('https://github.com/CUBRID/cubrid-admin/releases/tag/v1.0.0')).toBe(true);
      expect(isTrustedDownloadUrl('https://objects.githubusercontent.com/x')).toBe(true);
      expect(isTrustedDownloadUrl('http://github.com/x')).toBe(false);
      expect(isTrustedDownloadUrl('https://github.com.evil.example/x')).toBe(false);
      expect(isTrustedDownloadUrl('javascript:alert(1)')).toBe(false);
      expect(isTrustedDownloadUrl(undefined)).toBe(false);
    });
  });

  describe('in a browser', () => {
    it('asks the server and keeps only the status fields', async () => {
      // apiClient's interceptor merges note/httpStatus/status into the payload.
      vi.mocked(apiClient.get).mockResolvedValue({ ...status, note: 'success', httpStatus: 200, status: 200 });

      await expect(fetchUpdateStatus()).resolves.toEqual(status);
      expect(apiClient.get).toHaveBeenCalledWith('/version/check');
    });

    it('rejects a malformed server response', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ note: 'success' });

      await expect(fetchUpdateStatus()).rejects.toThrow('Malformed update status');
    });

    it('propagates a failed request', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network Error'));

      await expect(fetchUpdateStatus()).rejects.toThrow('Network Error');
    });

    it('opens trusted URLs in a new tab without an opener', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);

      await expect(openUpdateUrl('https://github.com/a')).resolves.toBe(true);
      expect(open).toHaveBeenCalledWith('https://github.com/a', '_blank', 'noopener,noreferrer');
    });

    it('refuses untrusted URLs', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);

      await expect(openUpdateUrl('https://evil.example/a')).resolves.toBe(false);
      expect(open).not.toHaveBeenCalled();
    });

    it('has no startup notice or dismissal', async () => {
      await expect(fetchStartupUpdateNotice()).resolves.toBeNull();
      await expect(dismissUpdate('1.0.0')).resolves.toBeUndefined();
    });
  });

  describe('in the desktop app', () => {
    let bridge;

    beforeEach(() => {
      bridge = {
        getUpdateStatus: vi.fn().mockResolvedValue(status),
        getStartupUpdateNotice: vi.fn().mockResolvedValue(status),
        dismissUpdate: vi.fn().mockResolvedValue({ ok: true }),
        openUpdateDownload: vi.fn().mockResolvedValue(true),
      };
      window.desktopBridge = bridge;
    });

    it('asks the main process instead of the server', async () => {
      await expect(fetchUpdateStatus()).resolves.toEqual(status);
      expect(bridge.getUpdateStatus).toHaveBeenCalledTimes(1);
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('opens downloads through the main process, never window.open', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);

      await expect(openUpdateUrl('https://github.com/a')).resolves.toBe(true);
      expect(bridge.openUpdateDownload).toHaveBeenCalledWith('https://github.com/a');
      expect(open).not.toHaveBeenCalled();
    });

    it('does not even forward an untrusted URL to the main process', async () => {
      await expect(openUpdateUrl('file:///etc/passwd')).resolves.toBe(false);
      expect(bridge.openUpdateDownload).not.toHaveBeenCalled();
    });

    it('forwards startup notice and dismissal', async () => {
      await expect(fetchStartupUpdateNotice()).resolves.toEqual(status);
      await dismissUpdate('0.1.0-alpha.2');
      expect(bridge.dismissUpdate).toHaveBeenCalledWith('0.1.0-alpha.2');
    });
  });
});
