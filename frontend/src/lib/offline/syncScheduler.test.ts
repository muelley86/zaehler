import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncResult } from './syncEngine';
import { createSyncScheduler, RETRY_BASE_MS, RETRY_MAX_MS } from './syncScheduler';

function result(stopped: SyncResult['stopped'], conflicts = 0): SyncResult {
  return { synced: 0, conflicts, stopped };
}

describe('createSyncScheduler', () => {
  let trigger: ReturnType<typeof vi.fn<() => void>>;
  let scheduler: ReturnType<typeof createSyncScheduler>;

  beforeEach(() => {
    vi.useFakeTimers();
    trigger = vi.fn<() => void>();
    scheduler = createSyncScheduler(trigger);
  });

  afterEach(() => {
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('plant nach Offline-Abbruch Retries mit exponentiellem Backoff bis zum Cap', () => {
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(RETRY_BASE_MS - 1);
    expect(trigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(trigger).toHaveBeenCalledTimes(1);

    const delays = [60_000, 120_000, 240_000, RETRY_MAX_MS, RETRY_MAX_MS];
    delays.forEach((delay, i) => {
      scheduler.onRunFinished(result('offline'));
      vi.advanceTimersByTime(delay - 1);
      expect(trigger).toHaveBeenCalledTimes(i + 1);
      vi.advanceTimersByTime(1);
      expect(trigger).toHaveBeenCalledTimes(i + 2);
    });
  });

  it('erfolgreicher Lauf setzt den Backoff auf die Basis zurück', () => {
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(RETRY_BASE_MS);
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(60_000);
    expect(trigger).toHaveBeenCalledTimes(2);

    scheduler.onRunFinished(result('done'));
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(trigger).toHaveBeenCalledTimes(3);
  });

  it('done räumt einen geplanten Retry ab (Konflikte brauchen den Nutzer)', () => {
    scheduler.onRunFinished(result('offline'));
    scheduler.onRunFinished(result('done', 2));
    vi.advanceTimersByTime(10 * RETRY_MAX_MS);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('auth pausiert: bestehender Retry wird verworfen', () => {
    scheduler.onRunFinished(result('offline'));
    scheduler.onRunFinished(result('auth'));
    vi.advanceTimersByTime(10 * RETRY_MAX_MS);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('locked lässt einen bereits geplanten Retry unangetastet', () => {
    scheduler.onRunFinished(result('offline'));
    scheduler.onRunFinished(result('locked'));
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('ensureScheduled armt genau einen Timer, solange Items offen sind', () => {
    scheduler.ensureScheduled(2);
    scheduler.ensureScheduled(2);
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('ensureScheduled(0) räumt einen geplanten Retry ab', () => {
    scheduler.onRunFinished(result('offline'));
    scheduler.ensureScheduled(0);
    vi.advanceTimersByTime(10 * RETRY_MAX_MS);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('resetBackoff beginnt wieder bei der Basis-Verzögerung', () => {
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(RETRY_BASE_MS);
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(60_000);
    expect(trigger).toHaveBeenCalledTimes(2);

    scheduler.resetBackoff();
    scheduler.onRunFinished(result('offline'));
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(trigger).toHaveBeenCalledTimes(3);
  });

  it('dispose räumt alle Timer ab', () => {
    scheduler.onRunFinished(result('offline'));
    scheduler.dispose();
    vi.advanceTimersByTime(10 * RETRY_MAX_MS);
    expect(trigger).not.toHaveBeenCalled();
  });
});
