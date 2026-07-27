import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { BackupPayloadV1, BackupPreview, ReaderSettings } from '../types';
import {
  clearMetadataForImport,
  getAlbum,
  getDatabase,
  getFavorite,
  getProgress,
  getSettings,
  listAlbums,
  listChapters,
  listFavorites,
  listGroups,
  listHistory,
  listProgress,
  listSearchHistory,
  saveAlbum,
  saveChapter,
  saveGroup,
  setFavorite,
  setSetting,
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
  const settings = await getSettings();
  const { adultAcknowledged: _excluded, ...portableSettings } = settings;
  return {
    version: 1,
    exportedAt: Date.now(),
    albums: await listAlbums(),
    chapters: await listChapters(),
    favorites: await listFavorites(),
    groups: await listGroups(),
    history: await listHistory(),
    progress: await listProgress(),
    searchHistory: await listSearchHistory(),
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
    !payload ||
    payload.version !== 1 ||
    typeof payload.exportedAt !== 'number' ||
    !Array.isArray(payload.albums) ||
    !Array.isArray(payload.favorites) ||
    !payload.settings
  ) {
    throw new Error('备份内容不完整或版本不受支持。');
  }
}

export async function decodeBackup(text: string): Promise<BackupPayloadV1> {
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error('不是有效的 JMCR1 备份。');
  const compressed = base64UrlToBytes(parts[1]);
  const actual = await sha256Hex(compressed);
  if (actual !== parts[2].toLowerCase()) throw new Error('备份校验失败，内容可能被截断或修改。');
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
    historyCount: payload.history.length,
    progressCount: payload.progress.length,
  };
}

export async function importBackup(
  payload: BackupPayloadV1,
  mode: 'merge' | 'replace' = 'merge',
): Promise<void> {
  const adultAcknowledged = (await getSettings()).adultAcknowledged;
  if (mode === 'replace') await clearMetadataForImport();

  for (const album of payload.albums) {
    const existing = await getAlbum(album.id);
    if (!existing || (album.updatedAt || 0) >= (existing.updatedAt || 0)) await saveAlbum(album);
  }
  for (const chapter of payload.chapters || []) await saveChapter(chapter);

  for (const group of payload.groups || []) {
    const db = await getDatabase();
    const existing = await db.get('groups', group.id);
    if (!existing || group.updatedAt >= existing.updatedAt) await saveGroup(group);
  }

  for (const favorite of payload.favorites) {
    const existing = await getFavorite(favorite.albumId);
    if (!existing || favorite.updatedAt >= existing.updatedAt) {
      const next = await setFavorite(favorite.albumId, {
        groupId: favorite.groupId,
        note: favorite.note,
      });
      const db = await getDatabase();
      await db.put('favorites', { ...next, createdAt: favorite.createdAt, updatedAt: favorite.updatedAt });
    }
  }

  const db = await getDatabase();
  for (const history of payload.history || []) {
    const existing = await db.get('history', history.albumId);
    if (!existing || history.visitedAt >= existing.visitedAt) await db.put('history', history);
  }
  for (const progress of payload.progress || []) {
    const existing = await getProgress(progress.albumId);
    if (!existing || progress.updatedAt >= existing.updatedAt) await db.put('progress', progress);
  }
  for (const search of payload.searchHistory || []) await db.add('searchHistory', {
    query: search.query,
    kind: search.kind,
    searchedAt: search.searchedAt,
  });

  for (const [key, value] of Object.entries(payload.settings) as [keyof ReaderSettings, ReaderSettings[keyof ReaderSettings]][]) {
    if (key !== 'adultAcknowledged') await setSetting(key, value);
  }
  await setSetting('adultAcknowledged', adultAcknowledged);
}
