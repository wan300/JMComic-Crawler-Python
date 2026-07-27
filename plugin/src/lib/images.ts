import { ALLOWED_ORIGINS, DEFAULT_IMAGE_ORIGIN, FALLBACK_SCRAMBLE_ID } from '../constants';
import { JmError } from './bridge';

export interface StripGeometry {
  index: number;
  sourceY: number;
  destinationY: number;
  height: number;
}

export function isAllowedOrigin(url: string): boolean {
  try {
    return ALLOWED_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
}

export function assertAllowedOrigin(url: string): void {
  if (!isAllowedOrigin(url)) {
    throw new JmError(
      'origin_update_required',
      `上游返回了未声明的新域名 ${safeOrigin(url)}，需要更新插件后才能继续。`,
    );
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '（无效地址）';
  }
}

export function parseJmId(input: string | number): string | null {
  const value = String(input).trim();
  if (/^\d+$/.test(value)) return value;
  const prefixed = value.match(/^JM\s*[-_:]?\s*(\d+)$/i);
  if (prefixed) return prefixed[1];
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/\/(?:photos?|albums?)\/(\d+)(?:\/|$)/i);
    if (pathMatch) return pathMatch[1];
    const id = url.searchParams.get('id');
    if (id && /^\d+$/.test(id)) return id;
  } catch {
    const pathMatch = value.match(/(?:photos?|albums?)\/(\d+)/i);
    if (pathMatch) return pathMatch[1];
    const queryMatch = value.match(/(?:^|[?&])id=(\d+)/i);
    if (queryMatch) return queryMatch[1];
  }
  return null;
}

export function imageUrl(
  chapterId: string,
  filename: string,
  origin = DEFAULT_IMAGE_ORIGIN,
): string {
  const url = `${origin}/media/photos/${chapterId}/${encodeURIComponent(filename)}`;
  assertAllowedOrigin(url);
  return url;
}

export function coverUrl(albumId: string, origin = DEFAULT_IMAGE_ORIGIN): string {
  const url = `${origin}/media/albums/${albumId}_3x4.jpg`;
  assertAllowedOrigin(url);
  return url;
}

export function segmentationCount(
  scrambleId: string | number = FALLBACK_SCRAMBLE_ID,
  aid: string | number,
  filename: string,
  md5: (value: string) => string,
): number {
  const threshold = Number(scrambleId);
  const numericAid = Number(aid);
  const imageName = decodeURIComponent(filename).replace(/\.[^.]+$/, '');
  if (numericAid < threshold) return 0;
  if (numericAid < 268850) return 10;
  const x = numericAid < 421926 ? 10 : 8;
  const digest = md5(`${numericAid}${imageName}`);
  return (digest.charCodeAt(digest.length - 1) % x) * 2 + 2;
}

export function stripGeometry(height: number, count: number): StripGeometry[] {
  if (count <= 0) return [{ index: 0, sourceY: 0, destinationY: 0, height }];
  const base = Math.floor(height / count);
  const over = height % count;
  return Array.from({ length: count }, (_, index) => {
    const sourceY = height - base * (index + 1) - over;
    const destinationY = base * index + (index === 0 ? 0 : over);
    return {
      index,
      sourceY,
      destinationY,
      height: base + (index === 0 ? over : 0),
    };
  });
}

export function isGif(filenameOrType: string): boolean {
  return /\.gif(?:$|[?#])/i.test(filenameOrType) || /^image\/gif/i.test(filenameOrType);
}
