import { describe, expect, it } from 'vitest';
import { md5Hex } from '../src/lib/crypto';
import {
  containSize,
  isAllowedOrigin,
  parseJmId,
  segmentationCount,
  stripGeometry,
} from '../src/lib/images';

describe('contained reader dimensions', () => {
  it('fits portrait pages by width without distortion', () => {
    expect(containSize(600, 900, 390, 844)).toEqual({ width: 390, height: 585 });
  });

  it('fits tall pages by height and rejects zero bounds', () => {
    const fitted = containSize(600, 1800, 390, 844);
    expect(fitted.width).toBeCloseTo(844 / 3);
    expect(fitted.height).toBe(844);
    expect(containSize(600, 900, 0, 844)).toEqual({ width: 0, height: 0 });
  });
});

describe('JM id parsing', () => {
  it.each([
    ['438516', '438516'],
    ['JM438516', '438516'],
    ['jm-438516', '438516'],
    ['https://18comic.example/album/438516/', '438516'],
    ['https://18comic.example/photo/438516', '438516'],
    ['https://18comic.example/view?id=438516', '438516'],
  ])('parses %s', (input, expected) => expect(parseJmId(input)).toBe(expected));

  it('does not treat ordinary text as an id', () => {
    expect(parseJmId('雨夜书店')).toBeNull();
  });
});

describe('origin allowlist', () => {
  it('accepts declared API and image origins only', () => {
    expect(isAllowedOrigin('https://www.cdnhjk.net/album?id=1')).toBe(true);
    expect(isAllowedOrigin('https://cdn-msp.jmapiproxy1.cc/media/photos/1/1.webp')).toBe(true);
    expect(isAllowedOrigin('https://new-upstream.invalid/media/1.webp')).toBe(false);
    expect(isAllowedOrigin('javascript:alert(1)')).toBe(false);
  });
});

describe('Python-compatible image segmentation boundaries', () => {
  it.each([
    [220979, 0],
    [220980, 10],
    [268849, 10],
    [268850, 6],
    [421925, 18],
    [421926, 14],
    [421927, 8],
  ])('returns %s -> %s', (albumId, expected) => {
    expect(segmentationCount(220980, albumId, '00001.webp', md5Hex)).toBe(expected);
  });

  it('uses character code for the final digest character', () => {
    const digest = () => '0000000000000000000000000000000f';
    expect(segmentationCount(220980, 421926, 'page.webp', digest)).toBe(14);
  });

  it('maps every pixel row exactly once', () => {
    const geometry = stripGeometry(101, 10);
    expect(geometry).toHaveLength(10);
    expect(geometry.reduce((sum, strip) => sum + strip.height, 0)).toBe(101);
    expect(geometry[0]).toEqual({ index: 0, sourceY: 90, destinationY: 0, height: 11 });
    expect(geometry[9]).toEqual({ index: 9, sourceY: 0, destinationY: 91, height: 10 });
  });
});
