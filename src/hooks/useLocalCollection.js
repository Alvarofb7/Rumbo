import { useCallback, useEffect, useState } from 'react';
import { readStorageJson, writeStorageJson } from '../lib/storage';

const identity = (item) => item;

export function useLocalCollection(storageKey, initialItems = [], normalizeItem = identity) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = readStorageJson(storageKey, null, { validate: Array.isArray, quarantine: true });
      const normalized = (stored || initialItems).map(normalizeItem);
      setItems(normalized);
      writeStorageJson(storageKey, normalized);
    } catch {
      setItems(initialItems.map(normalizeItem));
    } finally {
      setLoading(false);
    }
  }, [initialItems, normalizeItem, storageKey]);

  const persist = useCallback(
    (nextItems) => {
      if (!writeStorageJson(storageKey, nextItems)) throw new Error('No se han podido guardar los cambios en este dispositivo.');
      setItems(nextItems);
    },
    [storageKey],
  );

  const addItem = useCallback(
    async (item) => {
      const now = new Date().toISOString();
      const nextItem = normalizeItem({
        ...item,
        id: item.id || crypto.randomUUID(),
        createdAt: item.createdAt || now,
        updatedAt: now,
      });
      persist([nextItem, ...items]);
      return nextItem;
    },
    [items, normalizeItem, persist],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      const safePatch = { ...patch };
      delete safePatch.createdAt;
      delete safePatch.updatedAt;
      const nextItems = items.map((item) =>
        item.id === id ? normalizeItem({ ...item, ...safePatch, updatedAt: new Date().toISOString() }) : item,
      );
      persist(nextItems);
      return nextItems.find((item) => item.id === id);
    },
    [items, normalizeItem, persist],
  );

  const deleteItem = useCallback(
    async (id) => {
      persist(items.filter((item) => item.id !== id));
    },
    [items, persist],
  );

  return {
    items,
    loading,
    addItem,
    updateItem,
    deleteItem,
    retrySync: async () => undefined,
    syncState: { status: 'local', pending: false, offline: false, error: '' },
  };
}
