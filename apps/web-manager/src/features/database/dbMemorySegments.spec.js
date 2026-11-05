import { describe, expect, it } from 'vitest';
import { dbMemorySegments, formatBytes1 } from './dbMemorySegments';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

describe('dbMemorySegments', () => {
  it('splits the host memory into host use without the CAS, the CAS, and free, adding up to 100%', () => {
    // 16 GiB host, 6.6 GiB used, of which 512 MiB is this db's CAS.
    const seg = dbMemorySegments(512 * MiB, 16 * GiB, 6.6 * GiB);
    expect(seg.cas).toBe(512 * MiB);
    expect(seg.host).toBeCloseTo(6.6 * GiB - 512 * MiB);
    expect(seg.free).toBeCloseTo(9.4 * GiB);
    expect(seg.total).toBe(16 * GiB);
    expect(seg.casPct).toBeCloseTo(3.125);
    expect(seg.hostPct + seg.casPct + seg.freePct).toBeCloseTo(100);
  });

  it('puts host at 0 and draws the CAS only up to the used memory when the CAS sum is larger', () => {
    const seg = dbMemorySegments(5 * GiB, 16 * GiB, 4 * GiB);
    expect(seg.host).toBe(0);
    expect(seg.cas).toBe(5 * GiB);
    expect(seg.casPct).toBeCloseTo(25);
    expect(seg.freePct).toBeCloseTo(75);
  });

  it('gives no bar while the host memory is unknown', () => {
    expect(dbMemorySegments(512 * MiB, 0, 0)).toBeNull();
    expect(dbMemorySegments(512 * MiB, undefined, undefined)).toBeNull();
  });
});

describe('formatBytes1', () => {
  it('uses a binary unit with one decimal', () => {
    expect(formatBytes1(512 * MiB)).toBe('512.0 MiB');
    expect(formatBytes1(9.3 * GiB)).toBe('9.3 GiB');
    expect(formatBytes1(0)).toBe('0 B');
  });
});
