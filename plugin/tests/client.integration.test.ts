import { describe, expect, it } from 'vitest';
import { JmClient } from '../src/lib/jm-client';

describe('Manifest v3 network-backed JM client', () => {
  it('initializes dynamic version and line health', async () => {
    const client = new JmClient();
    await client.initialize();
    expect(client.appVersion).toBe('2.0.29');
    expect(client.activeDomains[0]).toBe('https://www.cdnhjk.net');
    await expect(client.healthCheck()).resolves.toBe('https://www.cdnhjk.net');
  });

  it('supports name and exact-number searches', async () => {
    const client = new JmClient();
    const names = await client.search('示例', { kind: 0 });
    expect(names.items.length).toBeGreaterThan(0);
    const exact = await client.search('JM438516');
    expect(exact).toMatchObject({ total: 1, redirectedId: '438516' });
  });

  it('loads album details, chapters, and the scramble id', async () => {
    const client = new JmClient();
    const album = await client.album('438516');
    expect(album.chapters).toHaveLength(3);
    const chapter = await client.chapter(album.chapters[0].id);
    expect(chapter).toMatchObject({
      albumId: '438516',
      pageCount: 5,
      scrambleId: 220980,
    });
  });
});
