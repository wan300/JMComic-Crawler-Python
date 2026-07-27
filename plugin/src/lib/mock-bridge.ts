import CryptoJS from 'crypto-js';
import { APP_TOKEN_SECRET, DOMAIN_SERVICE_SECRET } from '../constants';
import { md5Hex } from './crypto';

const albums = Array.from({ length: 12 }, (_, index) => {
  const id = String(438516 + index);
  return {
    id,
    author: index % 2 ? ['青空社'] : ['纸上电台'],
    description: '用于本地界面验收的模拟作品简介。真实插件会通过 BJTU MIS 受控桥访问匿名 JM API。',
    name: index === 0 ? '雨夜书店 · 完整界面示例' : `示例漫画 ${index + 1}`,
    image: '',
    tags: ['剧情', index % 2 ? '彩色' : '短篇'],
    category: { id: '1', title: index % 2 ? '单本' : '同人' },
    latest_ep_aid: String(4385160 + index * 10 + 2),
  };
});

function albumData(id: string) {
  const base = albums.find((album) => album.id === id) || { ...albums[0], id };
  return {
    ...base,
    likes: '1280',
    total_views: '92640',
    comment_total: '92',
    works: ['原创'],
    actors: ['店员', '旅人'],
    tags: ['剧情', '治愈', '彩色'],
    series: [1, 2, 3].map((sort) => ({
      id: String(Number(id) * 10 + sort),
      sort: String(sort),
      name: sort === 1 ? '序章 · 雨声' : `第 ${sort} 话`,
    })),
    related_list: albums.slice(1, 5),
  };
}

function chapterData(id: string) {
  const albumId = id.slice(0, -1) || '438516';
  return {
    id,
    series_id: albumId,
    name: `章节 JM${id}`,
    tags: ['剧情', '彩色'],
    images: ['00001.webp', '00002.webp', '00003.webp', '00004.webp', '00005.webp'],
    series: [1, 2, 3].map((sort) => ({
      id: String(Number(albumId) * 10 + sort),
      sort: String(sort),
      name: `第 ${sort} 话`,
    })),
  };
}

function encrypt(value: unknown, timestamp: string, secret = APP_TOKEN_SECRET): string {
  const key = CryptoJS.enc.Utf8.parse(md5Hex(`${timestamp}${secret}`));
  return CryptoJS.AES.encrypt(JSON.stringify(value), key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).ciphertext.toString(CryptoJS.enc.Base64);
}

export function installMockBridge(): void {
  window.__JMCR_MOCK__ = true;
  window.BjtuService = {
    async invoke(method, params = {}) {
      if (method === 'app.close_service') return { ok: true, data: {} };
      if (method !== 'app.http_request') {
        return { ok: false, error: { code: 'unknown_method', message: '模拟桥不支持此方法。' } };
      }
      const url = new URL(String(params.url));
      const headers = params.headers as Record<string, string> | undefined;
      const timestamp = headers?.tokenparam?.split(',')[0] || '';
      if (url.pathname.endsWith('/newsvr-2025.txt')) {
        return {
          ok: true,
          data: {
            statusCode: 200,
            data: encrypt({ Server: ['www.cdnhjk.net', 'www.cdngwc.cc'] }, '', DOMAIN_SERVICE_SECRET),
            header: {},
          },
        };
      }
      if (url.pathname === '/chapter_view_template') {
        return {
          ok: true,
          data: { statusCode: 200, data: '<script>var scramble_id = 220980;</script>', header: {} },
        };
      }
      let data: unknown;
      if (url.pathname === '/setting') {
        data = { jm3_version: '2.0.29' };
      } else if (url.pathname === '/search') {
        const query = url.searchParams.get('search_query') || '';
        data = {
          search_query: query,
          total: String(albums.length),
          content: albums.filter((album) => !query || album.name.includes(query) || album.author.join('').includes(query)),
        };
      } else if (url.pathname === '/categories/filter') {
        data = { total: String(albums.length), content: albums };
      } else if (url.pathname === '/album') {
        data = albumData(url.searchParams.get('id') || '438516');
      } else if (url.pathname === '/chapter') {
        data = chapterData(url.searchParams.get('id') || '4385161');
      } else {
        return { ok: true, data: { statusCode: 404, data: 'not found', header: {} } };
      }
      return {
        ok: true,
        data: {
          statusCode: 200,
          data: JSON.stringify({ code: 200, data: encrypt(data, timestamp) }),
          header: { 'content-type': 'application/json' },
        },
      };
    },
  };
}
