import { describe, expect, it } from 'vitest';
import { normalizeReaderPage } from '../src/reader';

describe('normalizeReaderPage', () => {
  it('keeps valid resume pages and clamps stale progress', () => {
    expect(normalizeReaderPage(3, 5)).toBe(3);
    expect(normalizeReaderPage(99, 5)).toBe(4);
    expect(normalizeReaderPage(-8, 5)).toBe(0);
  });

  it('rejects invalid page values and empty chapters', () => {
    expect(normalizeReaderPage(Number.NaN, 5)).toBe(0);
    expect(normalizeReaderPage(Number.POSITIVE_INFINITY, 5)).toBe(0);
    expect(normalizeReaderPage(2, 0)).toBe(0);
  });
});
