import type { ReaderSettings } from './types';

export const API_ORIGINS = [
  'https://www.cdnhjk.net',
  'https://www.cdngwc.cc',
  'https://www.cdngwc.net',
  'https://www.cdngwc.club',
  'https://www.cdnutc.me',
] as const;

export const DOMAIN_SERVICE_URLS = [
  'https://rup4a04-c01.tos-ap-southeast-1.bytepluses.com/newsvr-2025.txt',
  'https://rup4a04-c02.tos-cn-hongkong.bytepluses.com/newsvr-2025.txt',
  'https://rup4a04-c03.tos-cn-beijing.bytepluses.com.cn/newsvr-2025.txt',
] as const;

export const IMAGE_ORIGINS = [
  'https://cdn-msp.jmapiproxy1.cc',
  'https://cdn-msp2.jmapiproxy1.cc',
  'https://cdn-msp.jmapiproxy2.cc',
  'https://cdn-msp2.jmapiproxy2.cc',
  'https://cdn-msp3.jmapiproxy2.cc',
  'https://cdn-msp.jmapinodeudzn.net',
  'https://cdn-msp3.jmapinodeudzn.net',
] as const;

export const ALLOWED_ORIGINS = new Set<string>([
  ...API_ORIGINS,
  ...DOMAIN_SERVICE_URLS.map((url) => new URL(url).origin),
  ...IMAGE_ORIGINS,
]);

export const APP_TOKEN_SECRET = '185Hcomic3PAPP7R';
export const APP_TOKEN_SECRET_CONTENT = '18comicAPPContent';
export const DOMAIN_SERVICE_SECRET = 'diosfjckwpqpdfjkvnqQjsik';
export const FALLBACK_APP_VERSION = '2.0.29';
export const FALLBACK_SCRAMBLE_ID = 220980;
export const DEFAULT_IMAGE_ORIGIN = IMAGE_ORIGINS[0];

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'system',
  readerMode: 'vertical',
  blurCovers: true,
  reduceMotion: false,
  reduceTransparency: false,
  highContrast: false,
  cacheLimit: 'adaptive',
  appVersion: FALLBACK_APP_VERSION,
  adultAcknowledged: false,
};

export const CATEGORIES = [
  { value: '0', label: '全部' },
  { value: '1', label: '同人' },
  { value: '2', label: '单本' },
  { value: '3', label: '短篇' },
  { value: '4', label: '其他' },
] as const;

export const SEARCH_KINDS = [
  { value: 0, label: '站内' },
  { value: 1, label: '作品' },
  { value: 2, label: '作者' },
  { value: 3, label: '标签' },
  { value: 4, label: '角色' },
] as const;

export const ORDER_OPTIONS = [
  { value: 'mr', label: '最新' },
  { value: 'mv', label: '最多观看' },
  { value: 'mp', label: '最多图片' },
  { value: 'tf', label: '最多收藏' },
] as const;

export const TIME_OPTIONS = [
  { value: 'a', label: '全部' },
  { value: 't', label: '今日' },
  { value: 'w', label: '本周' },
  { value: 'm', label: '本月' },
] as const;

export const MIB = 1024 * 1024;
