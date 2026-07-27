import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  AlbumGrid,
  Cover,
  EmptyState,
  ErrorState,
  formatBytes,
  Spinner,
  Toast,
  Toggle,
} from './components';
import {
  CATEGORIES,
  DEFAULT_SETTINGS,
  ORDER_OPTIONS,
  SEARCH_KINDS,
  TIME_OPTIONS,
} from './constants';
import type {
  Album,
  AlbumSummary,
  BackupPayloadV1,
  BackupPreview,
  Chapter,
  DownloadJob,
  Favorite,
  FavoriteGroup,
  HistoryEntry,
  ReaderSettings,
  ReadingProgress,
  SearchHistoryEntry,
  SearchKind,
  SearchPage,
  StorageStats,
} from './types';
import {
  addHistory,
  addSearchHistory,
  clearHistory,
  clearSearchHistory,
  clearTemporaryImages,
  deleteFavorite,
  deletePinnedForChapter,
  getAlbum,
  getChapter,
  getFavorite,
  getProgress,
  getSettings,
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
} from './lib/db';
import { jmClient } from './lib/jm-client';
import { closeService } from './lib/bridge';
import { downloadManager } from './lib/downloads';
import { prefetchChapter, storageStats } from './lib/cache';
import {
  backupPreview,
  decodeBackup,
  encodeBackup,
  importBackup,
} from './lib/backup';
import { HorizontalReader, persistReaderProgress, VerticalReader } from './reader';

type Tab = 'discover' | 'search' | 'library' | 'downloads' | 'settings';
type Route =
  | { type: 'tab'; tab: Tab }
  | { type: 'album'; albumId: string }
  | { type: 'reader'; albumId: string; chapterId: string };

const TAB_LABELS: Record<Tab, string> = {
  discover: '发现',
  search: '搜索',
  library: '资料库',
  downloads: '下载',
  settings: '设置',
};

function parseRoute(): Route {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'album' && parts[1]) return { type: 'album', albumId: parts[1] };
  if (parts[0] === 'read' && parts[1] && parts[2]) {
    return { type: 'reader', albumId: parts[1], chapterId: parts[2] };
  }
  const tab = parts[0] as Tab;
  return { type: 'tab', tab: tab in TAB_LABELS ? tab : 'discover' };
}

function navigate(path: string): void {
  location.hash = `#/${path.replace(/^\/+/, '')}`;
}

function useRoute(): Route {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const update = () => setRoute(parseRoute());
    window.addEventListener('hashchange', update);
    if (!location.hash) navigate('discover');
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}

function ScreenHeader({
  title,
  eyebrow,
  action,
  back,
}: {
  title: string;
  eyebrow?: string;
  action?: preact.ComponentChildren;
  back?: () => void;
}) {
  return (
    <header class="screen-header">
      <div>
        {back && <button type="button" class="circle-button back-button" aria-label="返回" onClick={back}>‹</button>}
        {eyebrow && <p class="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

function DiscoverView({
  settings,
  openAlbum,
}: {
  settings: ReaderSettings;
  openAlbum: (album: AlbumSummary) => void;
}) {
  const [page, setPage] = useState<SearchPage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [order, setOrder] = useState('mr');
  const [time, setTime] = useState('a');
  const [category, setCategory] = useState('0');
  const load = useCallback(() => {
    setError(null);
    setPage(null);
    void jmClient.categories({ order, time, category }).then(setPage).catch(setError);
  }, [order, time, category]);
  useEffect(load, [load]);

  return (
    <section class="screen">
      <ScreenHeader
        eyebrow="今天想读什么？"
        title="发现"
        action={<span class="status-pill"><i /> 匿名 API</span>}
      />
      <div class="hero-card">
        <div>
          <span class="hero-badge">本地优先</span>
          <h2>阅读留在此设备</h2>
          <p>收藏、进度与离线图片只保存在当前插件沙箱中，不读取任何校园账号或数据。</p>
        </div>
        <span class="hero-glyph" aria-hidden="true">阅</span>
      </div>
      <div class="section-heading">
        <div><p class="eyebrow">Browse</p><h2>分类浏览</h2></div>
      </div>
      <div class="chip-row" aria-label="漫画分类">
        {CATEGORIES.map((item) => (
          <button
            type="button"
            class={`chip${category === item.value ? ' selected' : ''}`}
            onClick={() => setCategory(item.value)}
          >{item.label}</button>
        ))}
      </div>
      <div class="filter-bar">
        <select aria-label="排序" value={order} onChange={(event) => setOrder(event.currentTarget.value)}>
          {ORDER_OPTIONS.map((item) => <option value={item.value}>{item.label}</option>)}
        </select>
        <select aria-label="时间范围" value={time} onChange={(event) => setTime(event.currentTarget.value)}>
          {TIME_OPTIONS.map((item) => <option value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {error ? <ErrorState error={error} retry={load} /> : !page ? <Spinner label="正在连接可用线路" /> :
        page.items.length ? <AlbumGrid albums={page.items} settings={settings} onOpen={openAlbum} /> :
          <EmptyState title="这里暂时是空的" description="切换分类或时间范围再看看。" />}
    </section>
  );
}

function SearchView({
  settings,
  openAlbum,
  initial,
  clearInitial,
}: {
  settings: ReaderSettings;
  openAlbum: (album: AlbumSummary) => void;
  initial: { query: string; kind: SearchKind } | null;
  clearInitial: () => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<SearchKind>(0);
  const [order, setOrder] = useState('mr');
  const [time, setTime] = useState('a');
  const [result, setResult] = useState<SearchPage | null>(null);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refreshHistory = () => void listSearchHistory().then(setHistory);
  useEffect(refreshHistory, []);

  const submit = useCallback(async (value = query, nextKind = kind) => {
    const clean = value.trim();
    if (!clean) return;
    setQuery(clean);
    setKind(nextKind);
    setLoading(true);
    setError(null);
    try {
      const page = await jmClient.search(clean, { kind: nextKind, order, time });
      setResult(page);
      await addSearchHistory({ query: clean, kind: nextKind, searchedAt: Date.now() });
      refreshHistory();
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [query, kind, order, time]);

  useEffect(() => {
    if (!initial) return;
    void submit(initial.query, initial.kind);
    clearInitial();
  }, [initial]);

  return (
    <section class="screen search-screen">
      <ScreenHeader eyebrow="Search" title="搜索" />
      <form class="search-box" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder="编号、JM123、链接或名称"
          aria-label="搜索漫画"
          enterKeyHint="search"
        />
        {query && <button type="button" class="clear-button" aria-label="清空搜索" onClick={() => setQuery('')}>×</button>}
        <button type="submit" class="search-submit">搜索</button>
      </form>
      <div class="search-kind" role="tablist" aria-label="搜索范围">
        {SEARCH_KINDS.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={kind === item.value}
            class={kind === item.value ? 'selected' : ''}
            onClick={() => setKind(item.value)}
          >{item.label}</button>
        ))}
      </div>
      <div class="filter-bar compact">
        <select aria-label="搜索排序" value={order} onChange={(event) => setOrder(event.currentTarget.value)}>
          {ORDER_OPTIONS.map((item) => <option value={item.value}>{item.label}</option>)}
        </select>
        <select aria-label="搜索时间" value={time} onChange={(event) => setTime(event.currentTarget.value)}>
          {TIME_OPTIONS.map((item) => <option value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {loading && <Spinner label="正在搜索" />}
      {error && !loading && <ErrorState error={error} retry={() => void submit()} />}
      {result && !loading && !error && (
        <>
          <div class="section-heading">
            <div>
              <p class="eyebrow">{result.redirectedId ? '精准匹配' : `${result.total} 个结果`}</p>
              <h2>{result.redirectedId ? `JM${result.redirectedId}` : `“${result.query}”`}</h2>
            </div>
          </div>
          {result.items.length
            ? <AlbumGrid albums={result.items} settings={settings} onOpen={openAlbum} />
            : <EmptyState title="没有找到结果" description="试试作者、标签或更短的关键词。" />}
        </>
      )}
      {!result && !loading && !error && (
        <div class="recent-searches">
          <div class="section-heading">
            <h2>最近搜索</h2>
            {history.length > 0 && <button type="button" class="text-button" onClick={async () => {
              await clearSearchHistory();
              refreshHistory();
            }}>清除</button>}
          </div>
          {history.length ? (
            <div class="history-list">
              {history.slice(0, 12).map((item) => (
                <button type="button" onClick={() => void submit(item.query, item.kind)}>
                  <span aria-hidden="true">↗</span>
                  <span>{item.query}</span>
                  <small>{SEARCH_KINDS.find((kindItem) => kindItem.value === item.kind)?.label}</small>
                </button>
              ))}
            </div>
          ) : <EmptyState title="还没有搜索记录" description="支持编号精准搜索，也支持作品、作者、标签和角色。" />}
        </div>
      )}
    </section>
  );
}

function LibraryView({
  settings,
  openAlbum,
  notify,
}: {
  settings: ReaderSettings;
  openAlbum: (album: AlbumSummary) => void;
  notify: (message: string) => void;
}) {
  const [mode, setMode] = useState<'favorites' | 'history'>('favorites');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [albums, setAlbums] = useState<Record<string, Album>>({});
  const [groups, setGroups] = useState<FavoriteGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupName, setGroupName] = useState('');

  const refresh = useCallback(async () => {
    const [nextFavorites, nextHistory, nextGroups] = await Promise.all([
      listFavorites(),
      listHistory(),
      listGroups(),
    ]);
    setFavorites(nextFavorites);
    setHistory(nextHistory);
    setGroups(nextGroups);
    const ids = [...new Set([...nextFavorites.map((item) => item.albumId), ...nextHistory.map((item) => item.albumId)])];
    const loaded = await Promise.all(ids.map(async (id) => [id, await getAlbum(id)] as const));
    setAlbums(Object.fromEntries(loaded.filter((entry): entry is readonly [string, Album] => Boolean(entry[1]))));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const favoriteAlbums = favorites
    .filter((item) => groupFilter === 'all' || item.groupId === groupFilter)
    .map((item) => albums[item.albumId])
    .filter(Boolean);
  const historyAlbums = history.map((item) => albums[item.albumId] || {
    id: item.albumId,
    name: item.title,
    author: ['历史记录'],
    description: '',
    coverUrl: item.coverUrl,
    tags: [],
  });

  return (
    <section class="screen">
      <ScreenHeader eyebrow="Your shelf" title="资料库" />
      <div class="segmented-control" role="tablist">
        <button role="tab" type="button" aria-selected={mode === 'favorites'} class={mode === 'favorites' ? 'selected' : ''} onClick={() => setMode('favorites')}>收藏</button>
        <button role="tab" type="button" aria-selected={mode === 'history'} class={mode === 'history' ? 'selected' : ''} onClick={() => setMode('history')}>历史</button>
      </div>
      {mode === 'favorites' ? (
        <>
          <div class="library-tools">
            <select aria-label="收藏分组" value={groupFilter} onChange={(event) => setGroupFilter(event.currentTarget.value)}>
              <option value="all">全部收藏</option>
              <option value="default">未分组</option>
              {groups.map((group) => <option value={group.id}>{group.name}</option>)}
            </select>
            <form onSubmit={async (event) => {
              event.preventDefault();
              const name = groupName.trim();
              if (!name) return;
              const now = Date.now();
              await saveGroup({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now });
              setGroupName('');
              notify('已创建收藏分组');
              void refresh();
            }}>
              <input value={groupName} onInput={(event) => setGroupName(event.currentTarget.value)} placeholder="新分组" aria-label="新收藏分组名称" />
              <button type="submit" class="button subtle">添加</button>
            </form>
          </div>
          {favoriteAlbums.length
            ? <AlbumGrid albums={favoriteAlbums} settings={settings} onOpen={openAlbum} />
            : <EmptyState title="收藏夹还是空的" description="在漫画详情页点按收藏，之后会出现在这里。" />}
        </>
      ) : (
        <>
          {historyAlbums.length > 0 && (
            <div class="section-heading">
              <p>{historyAlbums.length} 本最近阅读</p>
              <button class="text-button" type="button" onClick={async () => {
                await clearHistory();
                notify('阅读历史已清除');
                void refresh();
              }}>清除</button>
            </div>
          )}
          {historyAlbums.length
            ? <AlbumGrid albums={historyAlbums} settings={settings} onOpen={openAlbum} />
            : <EmptyState title="还没有阅读历史" description="打开任意章节后，续读位置会自动保存在这里。" />}
        </>
      )}
    </section>
  );
}

function DownloadsView({ notify }: { notify: (message: string) => void }) {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  useEffect(() => downloadManager.subscribe(setJobs), []);
  return (
    <section class="screen">
      <ScreenHeader eyebrow="Offline" title="下载" />
      <div class="info-card">
        <span aria-hidden="true">↓</span>
        <p>固定下载不会被自动清理。应用重启后，未完成任务会保持暂停，等待你手动恢复。</p>
      </div>
      {jobs.length ? (
        <div class="download-list">
          {jobs.map((job) => {
            const fraction = job.totalImages ? job.completedImages / job.totalImages : 0;
            return (
              <article class="download-card">
                <div class="download-card-top">
                  <div>
                    <span class={`job-status ${job.status}`}>{({
                      queued: '等待中',
                      running: '下载中',
                      paused: '已暂停',
                      failed: '失败',
                      completed: '已完成',
                      cancelled: '已取消',
                    })[job.status]}</span>
                    <h2>{job.albumTitle}</h2>
                    <p>{job.scope === 'album' ? `整本 · ${job.chapterIds.length} 章` : '单章'} · {job.completedImages}/{job.totalImages || '…'} 页</p>
                  </div>
                  <strong>{Math.round(fraction * 100)}%</strong>
                </div>
                <div class="progress-track"><i style={{ width: `${fraction * 100}%` }} /></div>
                {job.error && <p class="job-error">{job.error}</p>}
                <div class="button-row">
                  {job.status === 'running' && <button type="button" class="button subtle" onClick={() => void downloadManager.pause(job.id)}>暂停</button>}
                  {(['paused', 'failed', 'cancelled'] as const).includes(job.status as never) && <button type="button" class="button primary" onClick={() => void downloadManager.resume(job.id)}>恢复</button>}
                  {!['completed', 'cancelled'].includes(job.status) && <button type="button" class="button subtle danger" onClick={() => void downloadManager.cancel(job.id)}>取消</button>}
                  {['completed', 'cancelled'].includes(job.status) && <button type="button" class="button subtle danger" onClick={async () => {
                    if (job.status === 'completed' && !confirm('同时删除这项任务的固定离线图片？')) return;
                    if (job.status === 'completed') {
                      for (const chapterId of job.chapterIds) await deletePinnedForChapter(chapterId);
                    }
                    await downloadManager.remove(job.id);
                    notify('下载记录已删除');
                  }}>删除</button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <EmptyState title="还没有下载任务" description="可以在漫画详情页下载整本，或在阅读器中固定下载当前章。" />}
    </section>
  );
}

function SettingsView({
  settings,
  updateSetting,
  notify,
}: {
  settings: ReaderSettings;
  updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [backupText, setBackupText] = useState('');
  const [payload, setPayload] = useState<BackupPayloadV1 | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const refreshStats = () => void storageStats().then(setStats);
  useEffect(refreshStats, []);

  const chooseBackup = async () => {
    try {
      const text = backupText.trim() || await navigator.clipboard.readText();
      const decoded = await decodeBackup(text);
      setPayload(decoded);
      setPreview(backupPreview(decoded));
      setBackupText(text);
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法读取备份');
    }
  };

  return (
    <section class="screen settings-screen">
      <ScreenHeader eyebrow="Preferences" title="设置" />
      <h2 class="settings-heading">外观</h2>
      <div class="settings-group">
        <label class="setting-row">
          <span><strong>主题</strong><small>跟随系统，或固定明暗外观</small></span>
          <select value={settings.theme} onChange={(event) => void updateSetting('theme', event.currentTarget.value as ReaderSettings['theme'])}>
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <Toggle checked={settings.blurCovers} onChange={(value) => void updateSetting('blurCovers', value)} label="默认模糊封面" description="可在每张封面上单独揭示" />
        <Toggle checked={settings.reduceMotion} onChange={(value) => void updateSetting('reduceMotion', value)} label="减少动态效果" description="用淡入淡出替代弹簧与滑动" />
        <Toggle checked={settings.reduceTransparency} onChange={(value) => void updateSetting('reduceTransparency', value)} label="减少透明度" description="浮层改用不透明背景" />
        <Toggle checked={settings.highContrast} onChange={(value) => void updateSetting('highContrast', value)} label="高对比度" description="强化边框、文字和焦点" />
      </div>

      <h2 class="settings-heading">阅读</h2>
      <div class="settings-group">
        <label class="setting-row">
          <span><strong>默认翻页方式</strong><small>所有章节共享进度</small></span>
          <select value={settings.readerMode} onChange={(event) => void updateSetting('readerMode', event.currentTarget.value as ReaderSettings['readerMode'])}>
            <option value="vertical">连续竖读</option>
            <option value="horizontal">横向单页</option>
          </select>
        </label>
      </div>

      <h2 class="settings-heading">存储</h2>
      <div class="settings-group">
        <label class="setting-row">
          <span><strong>临时缓存上限</strong><small>固定下载不计入此上限</small></span>
          <select value={settings.cacheLimit} onChange={(event) => {
            void updateSetting('cacheLimit', event.currentTarget.value as ReaderSettings['cacheLimit']).then(refreshStats);
          }}>
            <option value="adaptive">自适应</option>
            <option value="100">100 MiB</option>
            <option value="250">250 MiB</option>
            <option value="500">500 MiB</option>
            <option value="off">关闭缓存</option>
          </select>
        </label>
        {stats && (
          <div class="storage-panel">
            <div><span>临时缓存</span><strong>{formatBytes(stats.temporaryBytes)}</strong></div>
            <div><span>固定下载</span><strong>{formatBytes(stats.pinnedBytes)}</strong></div>
            <div><span>缓存上限</span><strong>{formatBytes(stats.budget)}</strong></div>
            <div><span>浏览器配额</span><strong>{stats.quota ? formatBytes(stats.quota) : '无法估算'}</strong></div>
          </div>
        )}
        <button class="setting-action danger" type="button" onClick={async () => {
          const removed = await clearTemporaryImages();
          notify(`已清理 ${formatBytes(removed)} 临时缓存`);
          refreshStats();
        }}>清理临时缓存</button>
      </div>

      <h2 class="settings-heading">迁移与备份</h2>
      <div class="settings-group backup-group">
        <p>备份包含收藏、分组、备注、历史、进度与设置，不包含图片、下载队列和 18+ 确认。</p>
        <button class="setting-action" type="button" onClick={async () => {
          try {
            const text = await encodeBackup();
            await navigator.clipboard.writeText(text);
            notify('JMCR1 备份已复制到剪贴板');
          } catch (error) {
            notify(error instanceof Error ? error.message : '复制备份失败');
          }
        }}>复制元数据备份</button>
        <textarea
          value={backupText}
          onInput={(event) => {
            setBackupText(event.currentTarget.value);
            setPayload(null);
            setPreview(null);
          }}
          placeholder="粘贴 JMCR1 备份，或直接从剪贴板读取"
          aria-label="备份文本"
          rows={3}
        />
        <button class="setting-action" type="button" onClick={() => void chooseBackup()}>预览备份</button>
        {preview && payload && (
          <div class="backup-preview">
            <strong>备份预览</strong>
            <p>{new Date(preview.exportedAt).toLocaleString('zh-CN')}</p>
            <div><span>{preview.albumCount} 本快照</span><span>{preview.favoriteCount} 个收藏</span><span>{preview.progressCount} 条进度</span></div>
            <div class="button-row">
              <button class="button primary" type="button" onClick={async () => {
                await importBackup(payload, 'merge');
                notify('已按更新时间合并备份');
                setPayload(null);
                setPreview(null);
              }}>合并导入</button>
              <button class="button subtle danger" type="button" onClick={async () => {
                if (!confirm('完全替换会清空当前元数据（不会删除离线图片）。继续吗？')) return;
                await importBackup(payload, 'replace');
                notify('已完全替换元数据');
                setPayload(null);
                setPreview(null);
              }}>完全替换</button>
            </div>
          </div>
        )}
      </div>

      <h2 class="settings-heading">关于</h2>
      <div class="settings-group about-card">
        <strong>JMComic 阅读器 1.0.0</strong>
        <p>非官方第三方插件，与 JMComic 及 BJTU MIS 官方均无隶属关系。请遵守当地法律、内容版权与站点规则。</p>
        <p>插件只调用无需校园权限的 <code>app.http_request</code> 与 <code>app.close_service</code>，不会读取身份、课表、凭据或其他校园数据。</p>
        <p>上游协议或域名变化时需要更新插件，不会绕过宿主的来源白名单。</p>
      </div>
    </section>
  );
}

function AlbumDetailView({
  albumId,
  settings,
  back,
  read,
  searchFacet,
  notify,
}: {
  albumId: string;
  settings: ReaderSettings;
  back: () => void;
  read: (album: Album, chapterId: string) => void;
  searchFacet: (query: string, kind: SearchKind) => void;
  notify: (message: string) => void;
}) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [favorite, setFavoriteState] = useState<Favorite | null>(null);
  const [groups, setGroups] = useState<FavoriteGroup[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    const cached = await getAlbum(albumId);
    if (cached) setAlbum(cached);
    try {
      const fresh = await jmClient.album(albumId);
      setAlbum(fresh);
      await saveAlbum(fresh);
    } catch (cause) {
      if (!cached) setError(cause);
    }
    setFavoriteState((await getFavorite(albumId)) || null);
    setGroups(await listGroups());
    setProgress((await getProgress(albumId)) || null);
  }, [albumId]);
  useEffect(() => { void load(); }, [load]);

  if (error && !album) return <section class="screen"><ScreenHeader title={`JM${albumId}`} back={back} /><ErrorState error={error} retry={load} /></section>;
  if (!album) return <section class="screen"><Spinner label="正在载入漫画资料" /></section>;
  const resumeChapter = progress?.chapterId || album.chapters[0]?.id;
  return (
    <section class="screen detail-screen">
      <ScreenHeader title="" back={back} action={<span class="detail-id">JM{album.id}</span>} />
      <div class="detail-hero">
        <Cover album={album} blurred={settings.blurCovers} eager />
        <div class="detail-summary">
          <p class="eyebrow">{album.category || '漫画'}</p>
          <h1>{album.name}</h1>
          <button class="facet-link author-link" type="button" onClick={() => searchFacet(album.author[0], 2)}>{album.author.join(' / ')}</button>
          <div class="detail-stats">
            <span><strong>{album.views.toLocaleString()}</strong>阅读</span>
            <span><strong>{album.likes.toLocaleString()}</strong>喜欢</span>
            <span><strong>{album.chapters.length}</strong>章节</span>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="button primary large" type="button" disabled={!resumeChapter} onClick={() => resumeChapter && read(album, resumeChapter)}>
          {progress ? `续读 · 第 ${progress.page + 1} 页` : '开始阅读'}
        </button>
        <button class={`round-action${favorite ? ' active' : ''}`} type="button" aria-label={favorite ? '取消收藏' : '收藏'} onClick={async () => {
          if (favorite) {
            await deleteFavorite(album.id);
            setFavoriteState(null);
            notify('已取消收藏');
          } else {
            const next = await setFavorite(album.id);
            setFavoriteState(next);
            notify('已收藏到资料库');
          }
        }}>{favorite ? '♥' : '♡'}</button>
        <button class="round-action" type="button" aria-label="下载整本" onClick={async () => {
          await downloadManager.enqueueAlbum(album);
          notify('整本下载已加入队列');
        }}>↓</button>
      </div>
      {favorite && (
        <div class="favorite-editor">
          <label>
            <span>收藏分组</span>
            <select value={favorite.groupId} onChange={async (event) => {
              const next = await setFavorite(album.id, { groupId: event.currentTarget.value });
              setFavoriteState(next);
            }}>
              <option value="default">未分组</option>
              {groups.map((group) => <option value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label>
            <span>私人备注</span>
            <textarea
              value={favorite.note}
              placeholder="只保存在此设备"
              rows={2}
              onInput={(event) => setFavoriteState({ ...favorite, note: event.currentTarget.value })}
              onBlur={async () => setFavoriteState(await setFavorite(album.id, { note: favorite.note }))}
            />
          </label>
        </div>
      )}
      {album.description && <div class="detail-section"><h2>简介</h2><p class="description">{album.description}</p></div>}
      <div class="detail-section facets">
        {album.tags.length > 0 && <div><h2>标签</h2><div class="chip-row">{album.tags.map((tag) => <button class="chip" type="button" onClick={() => searchFacet(tag, 3)}>{tag}</button>)}</div></div>}
        {album.works.length > 0 && <div><h2>作品</h2><div class="chip-row">{album.works.map((work) => <button class="chip" type="button" onClick={() => searchFacet(work, 1)}>{work}</button>)}</div></div>}
        {album.actors.length > 0 && <div><h2>角色</h2><div class="chip-row">{album.actors.map((actor) => <button class="chip" type="button" onClick={() => searchFacet(actor, 4)}>{actor}</button>)}</div></div>}
      </div>
      <div class="detail-section">
        <div class="section-heading"><h2>章节</h2><span>{album.chapters.length}</span></div>
        <div class="chapter-list">
          {album.chapters.map((chapter) => (
            <button type="button" onClick={() => read(album, chapter.id)}>
              <span><small>第 {chapter.index} 话</small><strong>{chapter.title}</strong></span>
              {progress?.chapterId === chapter.id && <em>读到 {progress.page + 1} 页</em>}
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      </div>
      {album.related.length > 0 && (
        <div class="detail-section">
          <div class="section-heading"><h2>相关推荐</h2></div>
          <AlbumGrid albums={album.related} settings={settings} onOpen={(item) => navigate(`album/${item.id}`)} />
        </div>
      )}
    </section>
  );
}

function ReaderView({
  albumId,
  chapterId,
  settings,
  updateSetting,
  notify,
}: {
  albumId: string;
  chapterId: string;
  settings: ReaderSettings;
  updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [initialPage, setInitialPage] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [controls, setControls] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cachedAlbum, cachedChapter, progress] = await Promise.all([
        getAlbum(albumId),
        getChapter(chapterId),
        getProgress(albumId),
      ]);
      const nextAlbum = cachedAlbum || await jmClient.album(albumId);
      const nextChapter = cachedChapter || await jmClient.chapter(chapterId);
      setAlbum(nextAlbum);
      setChapter(nextChapter);
      await Promise.all([saveAlbum(nextAlbum), saveChapter(nextChapter)]);
      const page = progress?.chapterId === chapterId ? progress.page : 0;
      setInitialPage(page);
      setCurrentPage(page);
      await addHistory({
        albumId,
        chapterId,
        title: nextAlbum.name,
        coverUrl: nextAlbum.coverUrl,
        visitedAt: Date.now(),
      });
    } catch (cause) {
      setError(cause);
    }
  }, [albumId, chapterId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!album || !chapter) return;
    const controller = new AbortController();
    void prefetchChapter(album.id, chapter.id, chapter.images, currentPage, 'temporary', controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [album?.id, chapter?.id]);

  const setPage = useCallback((page: number) => {
    setCurrentPage(page);
    if (album && chapter) void persistReaderProgress(album, chapter, page, settings.readerMode);
  }, [album, chapter, settings.readerMode]);

  if (error) return <main class="reader-shell"><ErrorState error={error} retry={load} /></main>;
  if (!album || !chapter) return <main class="reader-shell"><Spinner label="正在准备章节" /></main>;
  const chapterIndex = album.chapters.findIndex((item) => item.id === chapter.id);
  const previous = album.chapters[chapterIndex - 1];
  const next = album.chapters[chapterIndex + 1];

  return (
    <main class={`reader-shell ${settings.readerMode}`} onClick={(event) => {
      if ((event.target as HTMLElement).closest('button, select')) return;
      setControls((value) => !value);
    }}>
      <div class={`reader-toolbar top ${controls ? 'visible' : ''}`}>
        <button class="circle-button" type="button" aria-label="返回漫画详情" onClick={() => navigate(`album/${album.id}`)}>‹</button>
        <div><strong>{chapter.title}</strong><small>{album.name}</small></div>
        <button class="circle-button" type="button" aria-label="下载当前章" onClick={async () => {
          await downloadManager.enqueueChapter(album, chapter);
          notify('当前章已加入下载队列');
        }}>↓</button>
      </div>
      {settings.readerMode === 'vertical' ? (
        <VerticalReader album={album} chapter={chapter} settings={settings} initialPage={initialPage} onPageChange={setPage} />
      ) : (
        <HorizontalReader album={album} chapter={chapter} settings={settings} initialPage={initialPage} onPageChange={setPage} />
      )}
      <div class={`reader-toolbar bottom ${controls ? 'visible' : ''}`}>
        <button type="button" disabled={!previous} onClick={() => previous && navigate(`read/${album.id}/${previous.id}`)}>上一章</button>
        <div class="reader-mode-control">
          <button
            type="button"
            class={settings.readerMode === 'vertical' ? 'selected' : ''}
            aria-label="连续竖读"
            onClick={() => void updateSetting('readerMode', 'vertical')}
          >纵</button>
          <button
            type="button"
            class={settings.readerMode === 'horizontal' ? 'selected' : ''}
            aria-label="横向单页"
            onClick={() => void updateSetting('readerMode', 'horizontal')}
          >横</button>
        </div>
        <button type="button" disabled={!next} onClick={() => next && navigate(`read/${album.id}/${next.id}`)}>下一章</button>
      </div>
    </main>
  );
}

function AdultGate({ confirmAdult }: { confirmAdult: () => Promise<void> }) {
  return (
    <div class="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="adult-title">
      <div class="gate-card">
        <span class="gate-icon" aria-hidden="true">18+</span>
        <p class="eyebrow">Age confirmation</p>
        <h1 id="adult-title">仅限成年人</h1>
        <p>本插件可能展示成人漫画内容。继续即表示你已年满 18 周岁，并同意自行遵守所在地法律、内容版权与站点规则。</p>
        <div class="gate-notice">
          <strong>隐私说明</strong>
          <span>确认状态只保存在当前设备，不进入元数据备份；插件不会读取校园身份或账号资料。</span>
        </div>
        <button class="button primary large" type="button" onClick={() => void confirmAdult()}>我已年满 18 周岁</button>
        <button class="button subtle large" type="button" onClick={() => void closeService()}>退出插件</button>
      </div>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const [settings, setSettingsState] = useState<ReaderSettings | null>(null);
  const [toast, setToast] = useState('');
  const [pendingSearch, setPendingSearch] = useState<{ query: string; kind: SearchKind } | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? '' : current), 2800);
  }, []);

  useEffect(() => {
    void getSettings().then(setSettingsState);
    void downloadManager.initialize();
    void jmClient.initialize().catch(() => undefined);
  }, []);

  const updateSetting = useCallback(async <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    await setSetting(key, value);
    setSettingsState((current) => current ? { ...current, [key]: value } : current);
  }, []);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
    document.documentElement.dataset.reduceTransparency = String(settings.reduceTransparency);
    document.documentElement.dataset.highContrast = String(settings.highContrast);
    const themeColor = settings.theme === 'dark' ? '#09090b' : '#f5f5f7';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }, [settings]);

  if (!settings) return <main class="boot-screen"><Spinner label="正在打开本地资料库" /></main>;
  if (!settings.adultAcknowledged) {
    return <AdultGate confirmAdult={() => updateSetting('adultAcknowledged', true)} />;
  }

  if (route.type === 'reader') {
    return (
      <>
        <ReaderView
          albumId={route.albumId}
          chapterId={route.chapterId}
          settings={settings}
          updateSetting={updateSetting}
          notify={notify}
        />
        {toast && <Toast message={toast} />}
      </>
    );
  }

  const openAlbum = (album: AlbumSummary) => navigate(`album/${album.id}`);
  const tab = route.type === 'tab' ? route.tab : null;
  return (
    <div class="app-shell">
      <div class="app-top-safe">
        <span>JMComic</span>
        <button class="host-close" type="button" onClick={() => void closeService()}>关闭</button>
      </div>
      <main class="app-content">
        {route.type === 'album' && (
          <AlbumDetailView
            albumId={route.albumId}
            settings={settings}
            back={() => history.length > 1 ? history.back() : navigate('discover')}
            read={(album, chapterId) => navigate(`read/${album.id}/${chapterId}`)}
            searchFacet={(query, kind) => {
              setPendingSearch({ query, kind });
              navigate('search');
            }}
            notify={notify}
          />
        )}
        {tab === 'discover' && <DiscoverView settings={settings} openAlbum={openAlbum} />}
        {tab === 'search' && (
          <SearchView
            settings={settings}
            openAlbum={openAlbum}
            initial={pendingSearch}
            clearInitial={() => setPendingSearch(null)}
          />
        )}
        {tab === 'library' && <LibraryView settings={settings} openAlbum={openAlbum} notify={notify} />}
        {tab === 'downloads' && <DownloadsView notify={notify} />}
        {tab === 'settings' && <SettingsView settings={settings} updateSetting={updateSetting} notify={notify} />}
      </main>
      {route.type === 'tab' && (
        <nav class="tab-bar" aria-label="主要功能">
          {(Object.keys(TAB_LABELS) as Tab[]).map((item) => (
            <button
              type="button"
              class={tab === item ? 'selected' : ''}
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              <span class={`tab-icon icon-${item}`} aria-hidden="true" />
              <span>{TAB_LABELS[item]}</span>
            </button>
          ))}
        </nav>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
