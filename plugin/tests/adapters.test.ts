import { describe, expect, it } from 'vitest';
import { adaptAlbum, adaptAlbumSummary, adaptChapter } from '../src/lib/jm-client';

describe('raw API adapters', () => {
  it('keeps raw fields behind the album adapter', () => {
    const album = adaptAlbum({
      id: '123',
      name: '作品名',
      author: ['作者甲'],
      description: '简介',
      likes: '42',
      total_views: '900',
      comment_total: '7',
      tags: '剧情 彩色',
      works: ['原作'],
      actors: ['角色'],
      series: [{ id: '124', sort: '2', name: '第二话' }],
      related_list: [{ id: '125', name: '相关', author: '乙' }],
    });
    expect(album).toMatchObject({
      id: '123',
      author: ['作者甲'],
      likes: 42,
      views: 900,
      commentCount: 7,
      tags: ['剧情', '彩色'],
      works: ['原作'],
      actors: ['角色'],
    });
    expect(album.chapters[0]).toMatchObject({ id: '124', albumId: '123', index: 2 });
    expect(album.related[0].id).toBe('125');
  });

  it('adapts chapters and produces declared CDN URLs', () => {
    const chapter = adaptChapter({
      id: '124',
      series_id: '123',
      name: '第二话',
      images: ['00001.webp', '00002.gif'],
      series: [{ id: '124', sort: '2' }],
    });
    expect(chapter).toMatchObject({ id: '124', albumId: '123', index: 2, pageCount: 2 });
    expect(chapter.images[0]).toBe('https://cdn-msp.jmapiproxy1.cc/media/photos/124/00001.webp');
  });

  it('provides stable fallbacks for sparse search rows', () => {
    expect(adaptAlbumSummary({ id: 7, name: '稀疏记录' })).toMatchObject({
      id: '7',
      name: '稀疏记录',
      author: ['未知作者'],
      tags: [],
    });
  });
});
