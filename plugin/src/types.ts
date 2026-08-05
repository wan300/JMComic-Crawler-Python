export type ThemeMode = 'system' | 'light' | 'dark';
export type ReaderMode = 'vertical' | 'horizontal';
export type SearchKind = 0 | 1 | 2 | 3 | 4;
export type DownloadStatus = 'queued' | 'running' | 'paused' | 'failed' | 'completed' | 'cancelled';
export type CacheKind = 'temporary' | 'pinned';

export interface AlbumSummary {
  id: string;
  name: string;
  author: string[];
  description: string;
  coverUrl: string;
  category?: string;
  tags: string[];
  latestChapterId?: string;
  updatedAt?: number;
}

export interface Album extends AlbumSummary {
  works: string[];
  actors: string[];
  likes: number;
  views: number;
  commentCount: number;
  chapters: ChapterSummary[];
  related: AlbumSummary[];
  publishedAt?: string;
}

export interface ChapterSummary {
  id: string;
  albumId: string;
  index: number;
  title: string;
  publishedAt?: string;
  pageCount?: number;
}

export interface Chapter extends ChapterSummary {
  images: string[];
  tags: string[];
  scrambleId: number;
  imageOrigin: string;
}

export interface SearchPage {
  query: string;
  page: number;
  total: number;
  items: AlbumSummary[];
  hasMore: boolean;
  redirectedId?: string;
}

export interface ReadingProgress {
  albumId: string;
  chapterId: string;
  page: number;
  pageFraction: number;
  mode: ReaderMode;
  completed: boolean;
  updatedAt: number;
}

export interface Favorite {
  albumId: string;
  groupId: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface FavoriteGroup {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  albumId: string;
  chapterId: string;
  title: string;
  coverUrl: string;
  visitedAt: number;
}

export interface SearchHistoryEntry {
  id?: number;
  query: string;
  kind: SearchKind;
  searchedAt: number;
}

export interface DownloadJob {
  id: string;
  scope: 'chapter' | 'album';
  albumId: string;
  albumTitle: string;
  chapterIds: string[];
  completedChapterIds: string[];
  totalImages: number;
  completedImages: number;
  status: DownloadStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CachedImage {
  key: string;
  albumId: string;
  chapterId: string;
  page: number;
  sourceUrl: string;
  contentType: string;
  bytes: number;
  kind: CacheKind;
  accessedAt: number;
  createdAt: number;
}

export interface ReaderSettings {
  theme: ThemeMode;
  readerMode: ReaderMode;
  blurCovers: boolean;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  highContrast: boolean;
  cacheLimit: 'adaptive' | '100' | '250' | '500' | 'off';
  appVersion: string;
  adultAcknowledged: boolean;
}

export interface BackupPayloadV1 {
  version: 1;
  exportedAt: number;
  albums: Album[];
  chapters: Chapter[];
  favorites: Favorite[];
  groups: FavoriteGroup[];
  history: HistoryEntry[];
  progress: ReadingProgress[];
  searchHistory: SearchHistoryEntry[];
  settings: Omit<ReaderSettings, 'adultAcknowledged'>;
}

export interface BackupPreview {
  exportedAt: number;
  albumCount: number;
  favoriteCount: number;
  historyCount: number;
  progressCount: number;
}

export interface StorageStats {
  usage: number;
  quota: number;
  globalQuota: number;
  available: number;
  temporaryBytes: number;
  pinnedBytes: number;
  budget: number;
}

export interface HostThemeState {
  colorScheme: 'light' | 'dark';
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface HostViewportState {
  width: number;
  height: number;
  density: number;
  fontScale: number;
  orientation: 'portrait' | 'landscape';
  safeAreaTop: number;
  safeAreaRight: number;
  safeAreaBottom: number;
  safeAreaLeft: number;
  imeHeight: number;
}

export interface HostNetworkState {
  online: boolean;
  validated: boolean;
  metered: boolean;
  transport: string;
}

export interface HostRuntimeState {
  theme: HostThemeState;
  viewport: HostViewportState;
  network: HostNetworkState;
}

export interface RawApiEnvelope {
  code: number;
  data: string | [];
  errorMsg?: string;
}

declare global {
  const __BJTU_PLUGIN_ANDROID_HOST__: boolean;
  const __BJTU_PLUGIN_MOCK_SCENARIO__: Record<string, unknown>;
  interface Window {
    __JMCR_V3_TEST__?: {
      kvValues(): Record<string, unknown>;
      cacheKeys(): string[];
      emit(event: string, data: unknown): Promise<boolean>;
    };
  }
}
