// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  collection: vi.fn(() => ({ id: 'collection' })),
  doc: vi.fn((...parts) => ({ id: parts.length === 1 ? 'inbox-1' : parts.at(-1) })),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  setDoc: vi.fn(() => Promise.resolve()),
  runTransaction: vi.fn(async (_db, update) => update({ get: vi.fn(async () => ({ exists: () => false })), set: vi.fn() })),
}));

vi.mock('firebase/firestore', () => ({
  ...firestore,
  deleteField: vi.fn(),
  deleteDoc: vi.fn(),
  enableNetwork: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }));
vi.mock('../lib/diagnostics', () => ({ captureDiagnostic: vi.fn() }));

import { useUserCollection } from './useFirestoreCollection';

const user = { uid: 'user-1' };
const initialItems = [];

describe('useUserCollection durable addItem mode', () => {
  beforeEach(() => {
    firestore.doc.mockClear();
    firestore.setDoc.mockReset().mockResolvedValue(undefined);
    firestore.runTransaction.mockReset().mockImplementation(async (_db, update) => update({ get: vi.fn(async () => ({ exists: () => false })), set: vi.fn() }));
  });

  it('uses a transaction-backed committed result instead of the legacy queued setDoc path', async () => {
    const { result } = renderHook(() => useUserCollection(user, 'inbox', initialItems));
    let created;

    await act(async () => {
      created = await result.current.addItem({ name: 'Imported place' }, { durable: true });
    });

    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(created).toMatchObject({ id: 'inbox-1', committed: true });
  });

  it('rejects a transaction failure retryably without falling back to legacy setDoc', async () => {
    const rejected = new Error('unavailable');
    firestore.runTransaction.mockRejectedValueOnce(rejected);
    const { result } = renderHook(() => useUserCollection(user, 'inbox', initialItems));

    await expect(act(async () => result.current.addItem(
      { name: 'Imported place' },
      { durable: true, idempotencyKey: 'import_0123456789abcdef' },
    ))).rejects.toThrow('unavailable');

    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('uses the stable idempotency key document and skips set on a committed retry', async () => {
    const firstTransaction = { get: vi.fn(async () => ({ exists: () => false })), set: vi.fn() };
    const retryTransaction = { get: vi.fn(async () => ({ exists: () => true })), set: vi.fn() };
    firestore.runTransaction
      .mockImplementationOnce(async (_db, update) => update(firstTransaction))
      .mockImplementationOnce(async (_db, update) => update(retryTransaction));
    const { result } = renderHook(() => useUserCollection(user, 'inbox', initialItems));
    const options = { durable: true, idempotencyKey: 'import_0123456789abcdef' };

    let first;
    let retry;
    await act(async () => { first = await result.current.addItem({ name: 'Imported place' }, options); });
    await act(async () => { retry = await result.current.addItem({ name: 'Imported place' }, options); });

    expect(first).toMatchObject({ id: 'import_0123456789abcdef', committed: true });
    expect(retry).toMatchObject({ id: 'import_0123456789abcdef', committed: true });
    expect(firstTransaction.get).toHaveBeenCalledOnce();
    expect(firstTransaction.set).toHaveBeenCalledOnce();
    expect(retryTransaction.get).toHaveBeenCalledOnce();
    expect(retryTransaction.set).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('rejects an unsafe durable idempotency key before any Firestore mutation', async () => {
    const { result } = renderHook(() => useUserCollection(user, 'inbox', initialItems));

    await expect(act(async () => result.current.addItem(
      { name: 'Imported place' },
      { durable: true, idempotencyKey: 'https://unsafe.example/path' },
    ))).rejects.toThrow('Invalid durable idempotency key');

    expect(firestore.runTransaction).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('keeps the legacy queued setDoc mode unchanged when durable mode is omitted', async () => {
    const { result } = renderHook(() => useUserCollection(user, 'inbox', initialItems));

    await act(async () => { await result.current.addItem({ name: 'Manual place' }); });

    expect(firestore.setDoc).toHaveBeenCalledOnce();
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});
