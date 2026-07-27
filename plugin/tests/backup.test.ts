import { beforeEach, describe, expect, it } from 'vitest';
import type { BackupPayloadV1 } from '../src/types';
import {
  backupPreview,
  decodeBackup,
  encodeBackup,
  importBackup,
} from '../src/lib/backup';
import {
  getFavorite,
  getSettings,
  resetDatabaseForTests,
  setFavorite,
  setSetting,
} from '../src/lib/db';
import { DEFAULT_SETTINGS } from '../src/constants';

function payload(updatedAt = 100): BackupPayloadV1 {
  return {
    version: 1,
    exportedAt: 1234,
    albums: [],
    chapters: [],
    favorites: [{
      albumId: '1',
      groupId: 'default',
      note: `backup-${updatedAt}`,
      createdAt: 1,
      updatedAt,
    }],
    groups: [],
    history: [],
    progress: [],
    searchHistory: [],
    settings: {
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      blurCovers: false,
    },
  };
}

beforeEach(resetDatabaseForTests);

describe('JMCR1 backup', () => {
  it('round-trips a gzip/base64url/checksum payload', async () => {
    const encoded = await encodeBackup(payload());
    expect(encoded).toMatch(/^JMCR1\.[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    expect(await decodeBackup(encoded)).toEqual(payload());
    expect(backupPreview(payload())).toEqual({
      exportedAt: 1234,
      albumCount: 0,
      favoriteCount: 1,
      historyCount: 0,
      progressCount: 0,
    });
  });

  it('rejects a modified checksum', async () => {
    const encoded = await encodeBackup(payload());
    const corrupted = `${encoded.slice(0, -1)}${encoded.endsWith('0') ? '1' : '0'}`;
    await expect(decodeBackup(corrupted)).rejects.toThrow('校验失败');
  });

  it('merges favorites by updatedAt and preserves adult acknowledgement', async () => {
    await setFavorite('1', { note: 'local' });
    const local = await getFavorite('1');
    const dbPayload = payload((local?.updatedAt || 0) - 1);
    await setSetting('adultAcknowledged', true);
    await importBackup(dbPayload, 'merge');
    expect((await getFavorite('1'))?.note).toBe('local');
    expect((await getSettings()).adultAcknowledged).toBe(true);
    expect((await getSettings()).theme).toBe('dark');
  });
});
