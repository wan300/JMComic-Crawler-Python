import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AlbumSummary, ReaderSettings } from './types';
import { loadImage } from './lib/cache';
import { containSize, isGif, segmentationCount, stripGeometry } from './lib/images';
import { md5Hex } from './lib/crypto';

export function Spinner({ label = '正在加载' }: { label?: string }) {
  return (
    <div class="state-view" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: preact.ComponentChildren;
}) {
  return (
    <div class="state-view empty-state">
      <span class="empty-mark" aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const message = error instanceof Error ? error.message : '发生未知错误。';
  return (
    <div class="state-view error-state" role="alert">
      <span class="empty-mark" aria-hidden="true">!</span>
      <h2>没有完成请求</h2>
      <p>{message}</p>
      {retry && <button class="button primary" type="button" onClick={retry}>重试</button>}
    </div>
  );
}

export function Cover({
  album,
  blurred,
  eager = false,
}: {
  album: AlbumSummary;
  blurred: boolean;
  eager?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const hidden = blurred && !revealed;
  return (
    <div class={`cover-frame${hidden ? ' is-blurred' : ''}`}>
      <img
        src={album.coverUrl}
        alt={hidden ? '' : `${album.name} 封面`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
      {hidden && (
        <button
          class="reveal-cover"
          type="button"
          aria-label={`显示《${album.name}》封面`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setRevealed(true);
          }}
        >
          <span aria-hidden="true">◉</span>
          点按显示
        </button>
      )}
    </div>
  );
}

export function AlbumCard({
  album,
  settings,
  onOpen,
}: {
  album: AlbumSummary;
  settings: ReaderSettings;
  onOpen: (album: AlbumSummary) => void;
}) {
  return (
    <article class="album-card">
      <div class="album-cover-link">
        <Cover album={album} blurred={settings.blurCovers} />
        <button
          type="button"
          class="open-cover-overlay"
          aria-label={`打开《${album.name}》`}
          onClick={() => onOpen(album)}
        />
      </div>
      <button type="button" class="album-card-button" onClick={() => onOpen(album)}>
        <span class="album-card-copy">
          <strong>{album.name}</strong>
          <span>{album.author.join(' / ')}</span>
          {album.category && <small>{album.category}</small>}
        </span>
      </button>
    </article>
  );
}

export function AlbumGrid({
  albums,
  settings,
  onOpen,
}: {
  albums: AlbumSummary[];
  settings: ReaderSettings;
  onOpen: (album: AlbumSummary) => void;
}) {
  return (
    <div class="album-grid">
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} settings={settings} onOpen={onOpen} />
      ))}
    </div>
  );
}

function naturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('图片解码失败。'));
    image.src = src;
  });
}

export function ComicImage({
  albumId,
  chapterId,
  page,
  url,
  scrambleId,
  active = true,
  fitWithin,
}: {
  albumId: string;
  chapterId: string;
  page: number;
  url: string;
  scrambleId: number;
  active?: boolean;
  fitWithin?: { width: number; height: number };
}) {
  const [src, setSrc] = useState('');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    void loadImage({ albumId, chapterId, page, url, signal: controller.signal })
      .then(async (result) => {
        revoke = result.revoke;
        const dimensions = await naturalSize(result.src);
        if (!controller.signal.aborted) {
          setSrc(result.src);
          setSize(dimensions);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause);
      });
    return () => {
      controller.abort();
      revoke?.();
    };
  }, [active, albumId, chapterId, page, url, retryKey]);

  if (error) {
    return (
      <div class="comic-page image-error">
        <p>第 {page + 1} 页加载失败</p>
        <button type="button" class="button subtle" onClick={() => {
          setError(null);
          setSrc('');
          setSize(null);
          setRetryKey((value) => value + 1);
        }}>重试</button>
      </div>
    );
  }
  if (!src || !size) {
    return <div class="comic-page image-placeholder"><span class="spinner" /></div>;
  }
  const filename = new URL(url).pathname.split('/').pop() || '';
  const count = isGif(filename) ? 0 : segmentationCount(scrambleId, chapterId, filename, md5Hex);
  const strips = useMemo(() => stripGeometry(size.height, count), [size.height, count]);
  const fitted = fitWithin
    ? containSize(size.width, size.height, fitWithin.width, fitWithin.height)
    : null;
  const fittedStyle = fitted && fitted.width > 0 && fitted.height > 0
    ? { width: `${fitted.width}px`, height: `${fitted.height}px` }
    : undefined;
  if (!count) {
    return (
      <div class="comic-page" style={fittedStyle}>
        <img src={src} alt={`第 ${page + 1} 页`} draggable={false} />
      </div>
    );
  }
  return (
    <div
      class="comic-page scrambled-page"
      role="img"
      aria-label={`第 ${page + 1} 页`}
      style={{ aspectRatio: `${size.width} / ${size.height}`, ...fittedStyle }}
    >
      {strips.map((strip) => {
        const backgroundHeight = size.height / strip.height * 100;
        const denominator = size.height - strip.height;
        const position = denominator ? strip.sourceY / denominator * 100 : 0;
        return (
          <span
            key={strip.index}
            class="comic-strip"
            style={{
              top: `${strip.destinationY / size.height * 100}%`,
              height: `${strip.height / size.height * 100}%`,
              backgroundImage: `url("${src}")`,
              backgroundSize: `100% ${backgroundHeight}%`,
              backgroundPosition: `center ${position}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label class="setting-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

export function Toast({ message }: { message: string }) {
  return <div class="toast" role="status" aria-live="polite">{message}</div>;
}
