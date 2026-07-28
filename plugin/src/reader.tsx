import { useEffect, useRef, useState } from 'preact/hooks';
import type { Album, Chapter, ReaderSettings } from './types';
import { ComicImage } from './components';
import { saveProgress } from './lib/db';

interface ReaderProps {
  album: Album;
  chapter: Chapter;
  settings: ReaderSettings;
  initialPage: number;
  onPageChange: (page: number) => void;
}

function spring(
  from: number,
  to: number,
  response: number,
  dampingRatio: number,
  initialVelocity: number,
  onFrame: (value: number) => void,
  onComplete: () => void,
): () => void {
  const frequency = 2 * Math.PI / Math.max(0.08, response);
  let value = from;
  let velocity = initialVelocity;
  let previous = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.032, (now - previous) / 1000);
    previous = now;
    const acceleration = -frequency * frequency * (value - to) - 2 * dampingRatio * frequency * velocity;
    velocity += acceleration * dt;
    value += velocity * dt;
    onFrame(value);
    if (Math.abs(value - to) < 0.4 && Math.abs(velocity) < 4) {
      onFrame(to);
      onComplete();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function VerticalReader({
  album,
  chapter,
  settings: _settings,
  initialPage,
  onPageChange,
}: ReaderProps) {
  const initial = useRef(false);
  useEffect(() => {
    if (!initial.current && initialPage > 0) {
      initial.current = true;
      requestAnimationFrame(() => document.querySelector(`[data-reader-page="${initialPage}"]`)?.scrollIntoView());
    }
  }, [initialPage]);
  return (
    <div class="vertical-reader">
      {chapter.images.map((url, page) => (
        <div key={url} data-reader-page={page}>
          <ComicImage
            albumId={album.id}
            chapterId={chapter.id}
            page={page}
            url={url}
            scrambleId={chapter.scrambleId}
            onVisible={onPageChange}
          />
        </div>
      ))}
    </div>
  );
}

export function HorizontalReader({
  album,
  chapter,
  settings,
  initialPage,
  onPageChange,
}: ReaderProps) {
  const [page, setPage] = useState(Math.min(initialPage, chapter.images.length - 1));
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; time: number; lastX: number; lastTime: number; velocity: number } | null>(null);
  const animation = useRef<(() => void) | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setPage(Math.min(initialPage, chapter.images.length - 1));
  }, [chapter.id]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setViewportSize((current) => current.width === width && current.height === height
        ? current
        : { width, height });
    };
    update();
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    onPageChange(page);
  }, [page]);

  const width = () => viewport.current?.clientWidth || window.innerWidth;
  const moveTo = (
    nextPage: number,
    direction: -1 | 0 | 1,
    gesture: boolean,
    releaseVelocity = 0,
  ) => {
    animation.current?.();
    if (settings.reduceMotion) {
      setOffset(0);
      if (nextPage !== page) setPage(nextPage);
      return;
    }
    const target = direction * -width();
    animation.current = spring(
      offset,
      target,
      gesture ? 0.3 : 0.35,
      gesture ? 0.8 : 1,
      gesture ? releaseVelocity : 0,
      setOffset,
      () => {
        if (nextPage !== page) setPage(nextPage);
        setOffset(0);
        animation.current = null;
      },
    );
  };

  const navigate = (direction: -1 | 1, gesture = false, releaseVelocity = 0) => {
    const next = Math.max(0, Math.min(chapter.images.length - 1, page + direction));
    moveTo(next, next === page ? 0 : direction, gesture, releaseVelocity);
  };

  return (
    <div
      class="horizontal-reader"
      ref={viewport}
      tabIndex={0}
      aria-label={`横向阅读，第 ${page + 1} 页，共 ${chapter.images.length} 页`}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') navigate(-1);
        if (event.key === 'ArrowRight' || event.key === ' ') navigate(1);
      }}
      onPointerDown={(event) => {
        animation.current?.();
        animation.current = null;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = {
          x: event.clientX,
          time: performance.now(),
          lastX: event.clientX,
          lastTime: performance.now(),
          velocity: 0,
        };
      }}
      onPointerMove={(event) => {
        const gesture = start.current;
        if (!gesture) return;
        const delta = event.clientX - gesture.x;
        if (Math.abs(delta) < 10 && offset === 0) return;
        const now = performance.now();
        const elapsed = Math.max(1, now - gesture.lastTime);
        gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
        gesture.lastX = event.clientX;
        gesture.lastTime = now;
        const atStart = page === 0 && delta > 0;
        const atEnd = page === chapter.images.length - 1 && delta < 0;
        setOffset((atStart || atEnd) ? rubberband(delta, width(), 0.55) : delta);
      }}
      onPointerUp={(event) => {
        const gesture = start.current;
        start.current = null;
        if (!gesture) return;
        const projected = offset + gesture.velocity * (0.998 / (1 - 0.998));
        const threshold = width() * 0.25;
        const releaseVelocity = gesture.velocity * 1000;
        if (projected < -threshold && page < chapter.images.length - 1) navigate(1, true, releaseVelocity);
        else if (projected > threshold && page > 0) navigate(-1, true, releaseVelocity);
        else moveTo(page, 0, true, releaseVelocity);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
        moveTo(page, 0, true);
      }}
    >
      <div class="horizontal-track" style={{ transform: `translate3d(${offset}px,0,0)` }}>
        <ComicImage
          albumId={album.id}
          chapterId={chapter.id}
          page={page}
          url={chapter.images[page]}
          scrambleId={chapter.scrambleId}
          fitWithin={viewportSize}
        />
      </div>
      <button class="reader-hit reader-hit-left" type="button" aria-label="上一页" onClick={() => navigate(-1)} />
      <button class="reader-hit reader-hit-right" type="button" aria-label="下一页" onClick={() => navigate(1)} />
      <div class="page-indicator">{page + 1} / {chapter.images.length}</div>
    </div>
  );
}

export async function persistReaderProgress(
  album: Album,
  chapter: Chapter,
  page: number,
  mode: ReaderSettings['readerMode'],
): Promise<void> {
  await saveProgress({
    albumId: album.id,
    chapterId: chapter.id,
    page,
    pageFraction: chapter.images.length > 1 ? page / (chapter.images.length - 1) : 1,
    mode,
    completed: page >= chapter.images.length - 1,
    updatedAt: Date.now(),
  });
}
