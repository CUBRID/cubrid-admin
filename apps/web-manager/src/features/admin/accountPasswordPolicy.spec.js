import { describe, expect, it, vi } from 'vitest';
import { GENERATED_PASSWORD_LENGTH, generateAccountPassword, isValidAccountPassword } from './accountPasswordPolicy';

describe('generated temporary passwords', () => {
  it('always pass the server policy, with a letter, a digit and a symbol', () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateAccountPassword();
      expect(pw).toHaveLength(GENERATED_PASSWORD_LENGTH);
      expect(isValidAccountPassword(pw)).toBe(true);
      expect(pw).toMatch(/[A-Za-z]/);
      expect(pw).toMatch(/\d/);
      expect(pw).toMatch(/[!@#$%*\-_+=?]/);
    }
  });

  it('leave out characters that are easy to misread', () => {
    const all = Array.from({ length: 300 }, () => generateAccountPassword()).join('');
    expect(all).not.toMatch(/[0Oo1lI]/);
  });

  it('are not repeated', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateAccountPassword()));
    expect(seen.size).toBe(1000);
  });

  it('come from the cryptographic random source', () => {
    const random = vi.fn((buf) => crypto.getRandomValues(buf));
    generateAccountPassword(12, random);
    expect(random).toHaveBeenCalled();
  });
});
