import type { Album, Chapter, DownloadJob } from '../types';
import { loadImage } from './cache';
import {
  deleteDownloadJob,
  getChapter,
  getDownloadJob,
  listDownloadJobs,
  putDownloadJob,
  recoverDownloadJobs,
  saveChapter,
} from './db';
import { jmClient } from './jm-client';
import { JmError } from './bridge';
import { getHostRuntimeState } from './host';

type Listener = (jobs: DownloadJob[]) => void;

function jobId(scope: 'chapter' | 'album', albumId: string, chapterId?: string): string {
  return `${scope}:${albumId}:${chapterId || 'all'}`;
}

export class DownloadManager {
  private listeners = new Set<Listener>();
  private processing = false;
  private abortController: AbortController | null = null;
  private currentJobId: string | null = null;

  async initialize(): Promise<void> {
    await recoverDownloadJobs();
    await this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void listDownloadJobs().then(listener);
    return () => this.listeners.delete(listener);
  }

  async enqueueChapter(album: Album, chapter: Chapter): Promise<DownloadJob> {
    return this.enqueue({
      id: jobId('chapter', album.id, chapter.id),
      scope: 'chapter',
      albumId: album.id,
      albumTitle: album.name,
      chapterIds: [chapter.id],
      completedChapterIds: [],
      totalImages: chapter.images.length,
      completedImages: 0,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async enqueueAlbum(album: Album): Promise<DownloadJob> {
    return this.enqueue({
      id: jobId('album', album.id),
      scope: 'album',
      albumId: album.id,
      albumTitle: album.name,
      chapterIds: album.chapters.map((chapter) => chapter.id),
      completedChapterIds: [],
      totalImages: 0,
      completedImages: 0,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async pause(id: string): Promise<void> {
    const job = await getDownloadJob(id);
    if (!job || job.status === 'completed') return;
    job.status = 'paused';
    job.updatedAt = Date.now();
    await putDownloadJob(job);
    if (this.currentJobId === id) this.abortController?.abort();
    await this.emit();
  }

  async pauseActive(reason = '应用进入后台，任务已暂停以避免静默消耗流量。'): Promise<number> {
    const active = (await listDownloadJobs()).filter((job) => (
      job.status === 'running' || job.status === 'queued'
    ));
    for (const job of active) {
      await putDownloadJob({
        ...job,
        status: 'paused',
        error: reason,
        updatedAt: Date.now(),
      });
    }
    if (active.some((job) => job.id === this.currentJobId)) this.abortController?.abort();
    await this.emit();
    return active.length;
  }

  async resume(id: string): Promise<void> {
    const job = await getDownloadJob(id);
    if (!job || job.status === 'completed') return;
    job.status = 'queued';
    job.error = undefined;
    job.updatedAt = Date.now();
    await putDownloadJob(job);
    await this.emit();
    void this.process();
  }

  async cancel(id: string): Promise<void> {
    const job = await getDownloadJob(id);
    if (!job) return;
    job.status = 'cancelled';
    job.updatedAt = Date.now();
    await putDownloadJob(job);
    if (this.currentJobId === id) this.abortController?.abort();
    await this.emit();
  }

  async retry(id: string): Promise<void> {
    await this.resume(id);
  }

  async remove(id: string): Promise<void> {
    await deleteDownloadJob(id);
    await this.emit();
  }

  private async enqueue(job: DownloadJob): Promise<DownloadJob> {
    const existing = await getDownloadJob(job.id);
    if (existing?.status === 'completed') return existing;
    await putDownloadJob(existing ? {
      ...existing,
      status: 'queued',
      error: undefined,
      updatedAt: Date.now(),
    } : job);
    await this.emit();
    void this.process();
    return (await getDownloadJob(job.id)) || job;
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    const network = getHostRuntimeState().network;
    if (!network.online || !network.validated) return;
    this.processing = true;
    try {
      while (true) {
        const job = (await listDownloadJobs()).find((item) => item.status === 'queued');
        if (!job) break;
        await this.run(job);
      }
    } finally {
      this.processing = false;
    }
  }

  private async run(job: DownloadJob): Promise<void> {
    job.status = 'running';
    job.updatedAt = Date.now();
    await putDownloadJob(job);
    await this.emit();
    this.abortController = new AbortController();
    this.currentJobId = job.id;
    try {
      for (const chapterId of job.chapterIds) {
        if (job.completedChapterIds.includes(chapterId)) continue;
        const current = await getDownloadJob(job.id);
        if (!current || current.status !== 'running') return;
        const chapter = await this.loadChapter(chapterId);
        if (!job.totalImages) {
          const knownCounts = await Promise.all(job.chapterIds.map(async (id) => (await getChapter(id))?.images.length || 0));
          job.totalImages = knownCounts.reduce((sum, count) => sum + count, 0);
        }
        for (let page = 0; page < chapter.images.length; page += 1) {
          const latest = await getDownloadJob(job.id);
          if (!latest || latest.status !== 'running') return;
          await loadImage({
            albumId: job.albumId,
            chapterId,
            page,
            url: chapter.images[page],
            kind: 'pinned',
            signal: this.abortController.signal,
          });
          job.completedImages += 1;
          job.totalImages = Math.max(job.totalImages, job.completedImages);
          job.updatedAt = Date.now();
          await putDownloadJob(job);
          await this.emit();
        }
        job.completedChapterIds.push(chapterId);
        job.updatedAt = Date.now();
        await putDownloadJob(job);
      }
      job.status = 'completed';
      job.completedImages = Math.max(job.completedImages, job.totalImages);
      job.updatedAt = Date.now();
      await putDownloadJob(job);
    } catch (error) {
      if (error instanceof JmError && error.code === 'cancelled') return;
      const current = await getDownloadJob(job.id);
      if (current?.status === 'paused' || current?.status === 'cancelled') return;
      job.status = error instanceof JmError && error.code === 'quota' ? 'paused' : 'failed';
      job.error = error instanceof Error ? error.message : '下载失败。';
      job.updatedAt = Date.now();
      await putDownloadJob(job);
    } finally {
      this.abortController = null;
      this.currentJobId = null;
      await this.emit();
    }
  }

  private async loadChapter(chapterId: string): Promise<Chapter> {
    const cached = await getChapter(chapterId);
    if (cached?.images.length) return cached;
    const chapter = await jmClient.chapter(chapterId);
    await saveChapter(chapter);
    return chapter;
  }

  private async emit(): Promise<void> {
    const jobs = await listDownloadJobs();
    for (const listener of this.listeners) listener(jobs);
  }
}

export const downloadManager = new DownloadManager();
