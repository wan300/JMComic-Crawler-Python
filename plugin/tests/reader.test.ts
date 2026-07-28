import { describe, expect, it } from 'vitest';
import {
  normalizeReaderPage,
  selectVerticalReaderPage,
} from '../src/reader';

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

describe('selectVerticalReaderPage', () => {
  it('selects the page under the reading anchor when several pages are visible', () => {
    expect(selectVerticalReaderPage([
      { page: 8, top: 0, bottom: 698 },
      { page: 9, top: 691, bottom: 1890 },
      { page: 10, top: 1886, bottom: 2600 },
    ], 2170)).toBe(9);
  });

  it('keeps the earlier page until the reading anchor crosses the boundary', () => {
    expect(selectVerticalReaderPage([
      { page: 8, top: 0, bottom: 1198 },
      { page: 9, top: 1191, bottom: 2390 },
    ], 2170)).toBe(8);
  });

  it('ignores invalid and fully off-screen measurements', () => {
    expect(selectVerticalReaderPage([
      { page: 1, top: -900, bottom: -20 },
      { page: 2, top: Number.NaN, bottom: 500 },
      { page: 3, top: 2300, bottom: 2500 },
    ], 2170)).toBeNull();
    expect(selectVerticalReaderPage([], 0)).toBeNull();
  });
});
