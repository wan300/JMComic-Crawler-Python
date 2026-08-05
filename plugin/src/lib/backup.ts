import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type {
  Album,
  BackupPayloadV1,
  BackupPreview,
  Chapter,
  Favorite,
  FavoriteGroup,
  HistoryEntry,
  ReaderSettings,
  ReadingProgress,
  SearchHistoryEntry,
} from '../types';
import {
  backupPayloadToMetadata,
  currentPortableMetadata,
  normalizeSearchHistoryQuery,
  replaceMetadataAtomically,
  type PortableMetadata,
} from './db';

const PREFIX = 'JMCR1';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBackupPayload(): Promise<BackupPayloadV1> {
  const metadata = await currentPortableMetadata();
  const { adultAcknowledged: _excluded, ...portableSettings } = metadata.settings;
  return {
    version: 1,
    exportedAt: Date.now(),
    albums: metadata.albums,
    chapters: metadata.chapters,
    favorites: metadata.favorites,
    groups: metadata.groups,
    history: metadata.history,
    progress: metadata.progress,
    searchHistory: metadata.searchHistory,
    settings: portableSettings,
  };
}

export async function encodeBackup(payload?: BackupPayloadV1): Promise<string> {
  const value = payload || await createBackupPayload();
  const compressed = gzipSync(strToU8(JSON.stringify(value)), { level: 9, mtime: 0 });
  return `${PREFIX}.${bytesToBase64Url(compressed)}.${await sha256Hex(compressed)}`;
}

function validatePayload(value: unknown): asserts value is BackupPayloadV1 {
  const payload = value as Partial<BackupPayloadV1>;
  if (
    !payload
    || payload.version !== 1
    || typeof payload.exportedAt !== 'number'
    || !Array.isArray(payload.albums)
    || !Array.isArray(payload.favorites)
    || !payload.settings
    || typeof payload.settings !== 'object'
  ) {
    throw new Error('备份内容不完整或版本不受支持。');
  }
}

export async function decodeBackup(text: string): Promise<BackupPayloadV1> {
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error('不是有效的 JMCR1 备份。');
  const compressed = base64UrlToBytes(parts[1]);
  const actual = await sha256Hex(compressed);
  if (actual !== parts[2].toLowerCase()) {
    throw new Error('备份校验失败，内容可能被截断或修改。');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(strFromU8(gunzipSync(compressed)));
  } catch (cause) {
    throw new Error('备份无法解压或解析。', { cause });
  }
  validatePayload(payload);
  return payload;
}

export function backupPreview(payload: BackupPayloadV1): BackupPreview {
  return {
    exportedAt: payload.exportedAt,
    albumCount: payload.albums.length,
    favoriteCount: payload.favorites.length,
    historyCount: payload.history?.length || 0,
    progressCount: payload.progress?.length || 0,
  };
}

function mergeNewest<T>(
  current: T[],
  incoming: T[],
  key: (value: T) => string,
  timestamp: (value: T) => number,
): T[] {
  const merged = new Map(current.map((value) => [key(value), value]));
  for (const value of incoming) {
    const previous = merged.get(key(value));
    if (!previous || timestamp(value) >= timestamp(previous)) merged.set(key(value), value);
  }
  return [...merged.values()];
}

function mergeMetadata(
  current: PortableMetadata,
  payload: BackupPayloadV1,
): PortableMetadata {
  const imported = backupPayloadToMetadata(payload, current.settings.adultAcknowledged);
  const chapterMap = new Map(current.chapters.map((chapter) => [chapter.id, chapter]));
  for (const chapter of imported.chapters) chapterMap.set(chapter.id, chapter);
  const searchHistory = mergeNewest<SearchHistoryEntry>(
    current.searchHistory,
    imported.searchHistory,
    (entry) => normalizeSearchHistoryQuery(entry.query),
    (entry) => entry.searchedAt,
  )
    .sort((a, b) => b.searchedAt - a.searchedAt)
    .slice(0, 50);
  return {
    albums: mergeNewest<Album>(
      current.albums,
      imported.albums,
      (album) => album.id,
      (album) => album.updatedAt || 0,
    ),
    chapters: [...chapterMap.values()] as Chapter[],
    favorites: mergeNewest<Favorite>(
      current.favorites,
      imported.favorites,
      (favorite) => favorite.albumId,
      (favorite) => favorite.updatedAt,
    ),
    groups: mergeNewest<FavoriteGroup>(
      current.groups,
      imported.groups,
      (group) => group.id,
      (group) => group.updatedAt,
    ),
    history: mergeNewest<HistoryEntry>(
      current.history,
      imported.history,
      (history) => history.albumId,
      (history) => history.visitedAt,
    )
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, 1000),
    progress: mergeNewest<ReadingProgress>(
      current.progress,
      imported.progress,
      (progress) => progress.albumId,
      (progress) => progress.updatedAt,
    ),
    searchHistory,
    settings: {
      ...current.settings,
      ...imported.settings,
      adultAcknowledged: current.settings.adultAcknowledged,
    } as ReaderSettings,
  };
}

export async function importBackup(
  payload: BackupPayloadV1,
  mode: 'merge' | 'replace' = 'merge',
): Promise<void> {
  const current = await currentPortableMetadata();
  const target = mode === 'replace'
    ? backupPayloadToMetadata(payload, current.settings.adultAcknowledged)
    : mergeMetadata(current, payload);
  await replaceMetadataAtomically(target);
}
