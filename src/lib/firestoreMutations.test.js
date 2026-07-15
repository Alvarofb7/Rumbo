import { describe, expect, it, vi } from 'vitest';
import {
  commitFirestoreMutation,
  convertFirestoreInboxRecommendation,
  convertLocalInboxRecommendation,
} from './firestoreMutations';

describe('Firestore mutations', () => {
  it('reports a rejected write, clears pending state, and rethrows it', async () => {
    const rejected = new Error('permission-denied');
    const incrementPendingWrites = vi.fn();
    const decrementPendingWrites = vi.fn();
    const setSyncError = vi.fn();
    const captureDiagnostic = vi.fn();

    await expect(
      commitFirestoreMutation({
        execute: () => Promise.reject(rejected),
        incrementPendingWrites,
        decrementPendingWrites,
        setSyncError,
        captureDiagnostic,
        diagnosticKey: 'sync.create',
        diagnosticContext: { collection: 'places' },
        fallbackMessage: 'No se ha podido guardar el cambio.',
      }),
    ).rejects.toThrow('permission-denied');

    expect(incrementPendingWrites).toHaveBeenCalledOnce();
    expect(decrementPendingWrites).toHaveBeenCalledOnce();
    expect(setSyncError).toHaveBeenCalledWith('permission-denied');
    expect(captureDiagnostic).toHaveBeenCalledWith('sync.create', rejected, { collection: 'places' });
  });

  it('keeps pending state until overlapping writes settle', async () => {
    let pending = 0;
    let releaseFirst;
    let releaseSecond;
    const first = new Promise((resolve) => { releaseFirst = resolve; });
    const second = new Promise((resolve) => { releaseSecond = resolve; });
    const common = { incrementPendingWrites: () => { pending += 1; }, decrementPendingWrites: () => { pending -= 1; }, setSyncError: vi.fn(), captureDiagnostic: vi.fn(), diagnosticKey: 'sync.create', diagnosticContext: {}, fallbackMessage: 'failed' };
    const one = commitFirestoreMutation({ ...common, execute: () => first });
    const two = commitFirestoreMutation({ ...common, execute: () => second });
    expect(pending).toBe(2);
    releaseFirst(); await one;
    expect(pending).toBe(1);
    releaseSecond(); await two;
    expect(pending).toBe(0);
  });

  it('returns a queued outcome after the offline timeout without completing twice', async () => {
    vi.useFakeTimers();
    let resolveWrite;
    const write = new Promise((resolve) => { resolveWrite = resolve; });
    const incrementPendingWrites = vi.fn();
    const decrementPendingWrites = vi.fn();
    const outcome = commitFirestoreMutation({
      execute: () => write,
      incrementPendingWrites,
      decrementPendingWrites,
      setSyncError: vi.fn(),
      captureDiagnostic: vi.fn(),
      diagnosticKey: 'sync.create',
      diagnosticContext: {},
      fallbackMessage: 'failed',
      offline: true,
      queueTimeoutMs: 20,
    });

    await vi.advanceTimersByTimeAsync(20);
    const queued = await outcome;
    expect(queued.queued).toBe(true);
    resolveWrite();
    await expect(queued.completion).resolves.toEqual({ result: undefined });
    expect(incrementPendingWrites).toHaveBeenCalledOnce();
    expect(decrementPendingWrites).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('propagates online write rejection instead of reporting it as queued', async () => {
    await expect(commitFirestoreMutation({
      execute: () => Promise.reject(new Error('permission-denied')),
      incrementPendingWrites: vi.fn(),
      decrementPendingWrites: vi.fn(),
      setSyncError: vi.fn(),
      captureDiagnostic: vi.fn(),
      diagnosticKey: 'sync.create',
      diagnosticContext: {},
      fallbackMessage: 'failed',
    })).rejects.toThrow('permission-denied');
  });

  it('exposes a safe queued completion when the offline write later rejects', async () => {
    vi.useFakeTimers();
    let rejectWrite;
    const rejected = new Error('permission-denied');
    const setSyncError = vi.fn();
    const outcome = commitFirestoreMutation({
      execute: () => new Promise((_, reject) => { rejectWrite = reject; }),
      incrementPendingWrites: vi.fn(), decrementPendingWrites: vi.fn(), setSyncError, captureDiagnostic: vi.fn(),
      diagnosticKey: 'sync.create', diagnosticContext: {}, fallbackMessage: 'failed', offline: true, queueTimeoutMs: 20,
    });
    await vi.advanceTimersByTimeAsync(20);
    const queued = await outcome;
    rejectWrite(rejected);
    await expect(queued.completion).resolves.toEqual({ error: rejected });
    expect(setSyncError).toHaveBeenCalledWith('permission-denied');
    vi.useRealTimers();
  });

  it('keeps the local inbox item when place creation fails', async () => {
    const addPlace = vi.fn().mockRejectedValue(new Error('storage full'));
    const deleteInbox = vi.fn();

    await expect(
      convertLocalInboxRecommendation({ inboxId: 'inbox-1', place: { name: 'Lugar' }, addPlace, deleteInbox }),
    ).rejects.toThrow('storage full');

    expect(deleteInbox).not.toHaveBeenCalled();
  });

  it('commits the Firestore place write and inbox delete as one batch', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const batch = { set: vi.fn(), delete: vi.fn(), commit };
    const createDocument = vi.fn()
      .mockReturnValueOnce({ id: 'place-1' })
      .mockReturnValueOnce({ id: 'inbox-1' });
    const timestamp = vi.fn(() => 'server-timestamp');

    const created = await convertFirestoreInboxRecommendation({
      db: {},
      userId: 'user-1',
      inboxId: 'inbox-1',
      place: { name: 'Lugar' },
      createCollection: vi.fn(() => ({ id: 'places-collection' })),
      createDocument,
      createBatch: () => batch,
      timestamp,
    });

    expect(batch.set).toHaveBeenCalledWith(
      { id: 'place-1' },
      { name: 'Lugar', createdAt: 'server-timestamp', updatedAt: 'server-timestamp' },
    );
    expect(batch.delete).toHaveBeenCalledWith({ id: 'inbox-1' });
    expect(commit).toHaveBeenCalledOnce();
    expect(created).toEqual({ id: 'place-1', name: 'Lugar' });
  });
});
