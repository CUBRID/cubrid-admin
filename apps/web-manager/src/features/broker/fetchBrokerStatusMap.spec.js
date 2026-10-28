import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./brokerApi', () => ({
  brokerApi: { getBrokerStatusBulk: vi.fn() },
}));

import { brokerApi } from './brokerApi';
import { fetchBrokerStatusMap } from './fetchBrokerStatusMap';

beforeEach(() => vi.resetAllMocks());

describe('fetchBrokerStatusMap', () => {
  it('keys the bulk response entries by broker name', async () => {
    brokerApi.getBrokerStatusBulk.mockResolvedValue({
      brokers: [{ bname: 'a', asinfo: [] }, { bname: 'b' }],
      note: 'success',
      httpStatus: 200,
      status: 200,
    });

    const map = await fetchBrokerStatusMap('h1', ['a', 'b']);

    expect(brokerApi.getBrokerStatusBulk).toHaveBeenCalledWith('h1', ['a', 'b']);
    expect([...map.keys()]).toEqual(['a', 'b']);
    expect(map.get('b')).toEqual({ bname: 'b' });
  });

  it('ignores empty names and skips the request when none remain', async () => {
    const map = await fetchBrokerStatusMap('h1', [undefined, '', null]);

    expect(map.size).toBe(0);
    expect(brokerApi.getBrokerStatusBulk).not.toHaveBeenCalled();
  });

  it('resolves to an empty map when the request fails', async () => {
    brokerApi.getBrokerStatusBulk.mockRejectedValue(new Error('boom'));

    const map = await fetchBrokerStatusMap('h1', ['a']);

    expect(map.size).toBe(0);
  });
});
