import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app';
import { DEFAULT_SETTINGS } from '../src/constants';
import { bucketKey, getSettings, resetDatabaseForTests, saveAlbum, saveChapter } from '../src/lib/db';
import { getHostSdk } from '../src/lib/host';
import { adaptAlbum, adaptChapter, jmClient } from '../src/lib/jm-client';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const album = adaptAlbum({ id: '123', name: '响应测试', author: ['作者'], series: [{ id: '1231' }] });
const chapter = adaptChapter({ id: '1231', series_id: '123', images: ['1.webp', '2.webp'] });
let container: HTMLDivElement;

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((element) => (
    element.getAttribute('aria-label') === label || element.textContent?.includes(label)
  ));
}

async function mount(path: string) {
  history.replaceState(null, '', `/#/${path}`);
  await act(async () => { render(<App />, container); });
}

async function check(assertion: () => void) {
  await vi.waitFor(async () => { await act(async () => { assertion(); }); });
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
  await resetDatabaseForTests();
  await getHostSdk().storage.kv.set('v1/settings/all', {
    ...DEFAULT_SETTINGS, adultAcknowledged: true, cacheLimit: 'off', readerMode: 'horizontal', reduceMotion: true,
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(jmClient, 'initialize').mockResolvedValue();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1]), { status: 200 }));
});

afterEach(async () => {
  await act(async () => { render(null, container); });
});

describe('interaction priority under slow host storage', () => {
  it('renders a stored album before unrelated favorite and group reads finish', async () => {
    await getHostSdk().storage.kv.set(bucketKey('albums', album.id), { [album.id]: album });
    const gate = deferred();
    const kv = getHostSdk().storage.kv;
    const read = kv.get.bind(kv);
    vi.spyOn(kv, 'get').mockImplementation(async (key) => {
      if (key.includes('/favorites/') || key.includes('/groups/')) await gate.promise;
      return read(key);
    });
    try {
      await mount(`album/${album.id}`);
      await check(() => expect(document.querySelector('.detail-summary h1')?.textContent).toBe('响应测试'));
    } finally {
      gate.resolve();
      await act(async () => { await gate.promise; });
    }
  });

  it('keeps back available while the chapter is still loading', async () => {
    await saveAlbum(album);
    const gate = deferred();
    vi.spyOn(jmClient, 'chapter').mockImplementation(async () => { await gate.promise; return chapter; });
    try {
      await mount(`album/${album.id}`);
      await check(() => expect(button('开始阅读')).toBeDefined());
      await act(async () => { button('开始阅读')!.click(); });
      await check(() => expect(document.querySelector('.reader-shell')).not.toBeNull());
      expect(button('返回漫画详情')).toBeDefined();
      await act(async () => { button('返回漫画详情')!.click(); });
      await check(() => expect(document.querySelector('.detail-summary h1')?.textContent).toBe('响应测试'));
    } finally {
      gate.resolve();
      await act(async () => { await gate.promise; });
    }
  });

  it('switches reading mode before the setting write finishes', async () => {
    await saveAlbum(album);
    await saveChapter(chapter);
    await mount(`read/${album.id}/${chapter.id}`);
    await check(() => expect(document.querySelector('.horizontal-reader')).not.toBeNull());
    const gate = deferred();
    const kv = getHostSdk().storage.kv;
    const write = kv.set.bind(kv);
    vi.spyOn(kv, 'set').mockImplementation(async (...args) => {
      if (args[0] === 'v1/settings/all') await gate.promise;
      return write(...args);
    });
    try {
      await act(async () => { button('连续竖读')!.click(); });
      await check(() => expect(document.querySelector('.vertical-reader')).not.toBeNull());
    } finally {
      gate.resolve();
      await act(async () => { await gate.promise; });
    }
  });

  it('returns to cached details and resumes the latest page while progress writes are blocked', async () => {
    await saveAlbum(album);
    await saveChapter(chapter);
    await mount(`album/${album.id}`);
    await check(() => expect(button('开始阅读')).toBeDefined());
    const gate = deferred();
    const kv = getHostSdk().storage.kv;
    const write = kv.set.bind(kv);
    const writes: Promise<unknown>[] = [];
    vi.spyOn(kv, 'set').mockImplementation((...args) => {
      const operation = (async () => {
        if (args[0].includes('/progress/')) await gate.promise;
        return write(...args);
      })();
      writes.push(operation);
      return operation;
    });
    try {
      await act(async () => { button('开始阅读')!.click(); });
      await check(() => expect(document.querySelector('.horizontal-reader')).not.toBeNull());
      await act(async () => { button('下一页')!.click(); });
      await check(() => expect(document.querySelector('.page-indicator')?.textContent).toBe('2 / 2'));
      await act(async () => { button('返回漫画详情')!.click(); });
      await check(() => expect(button('续读 · 第 2 页')).toBeDefined());
      await act(async () => { button('续读 · 第 2 页')!.click(); });
      await check(() => expect(document.querySelector('.page-indicator')?.textContent).toBe('2 / 2'));
      await act(async () => {
        expect(await window.__JMCR_V3_TEST__?.emit('back', {})).toBe(true);
      });
      await check(() => expect(button('续读 · 第 2 页')).toBeDefined());
    } finally {
      gate.resolve();
      await act(async () => { await Promise.allSettled(writes); });
    }
    await check(() => {
      const values = window.__JMCR_V3_TEST__?.kvValues();
      expect(values?.[bucketKey('progress', album.id)]).toMatchObject({ [album.id]: { page: 1 } });
    });
  });

  it('rolls a failed setting back and keeps a later successful choice', async () => {
    await saveAlbum(album);
    await saveChapter(chapter);
    await mount(`read/${album.id}/${chapter.id}`);
    await check(() => expect(document.querySelector('.horizontal-reader')).not.toBeNull());
    const kv = getHostSdk().storage.kv;
    const write = kv.set.bind(kv);
    const spy = vi.spyOn(kv, 'set').mockImplementation(async (...args) => {
      if (args[0] === 'v1/settings/all') throw new Error('storage unavailable');
      return write(...args);
    });
    await act(async () => { button('连续竖读')!.click(); });
    await check(() => {
      expect(document.querySelector('.horizontal-reader')).not.toBeNull();
      expect(document.body.textContent).toContain('设置保存失败');
    });
    spy.mockRestore();
    await act(async () => { button('连续竖读')!.click(); });
    await check(() => expect(document.querySelector('.vertical-reader')).not.toBeNull());
    expect((await getSettings()).readerMode).toBe('vertical');
  });
});
