import { useCallback, useEffect, useState } from 'react';

const identity = (item) => item;

export function useLocalCollection(storageKey, initialItems = [], normalizeItem = identity) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const normalized = JSON.parse(stored).map(normalizeItem);
      setItems(normalized);
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    } else {
      const normalized = initialItems.map(normalizeItem);
      setItems(normalized);
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    }
    setLoading(false);
  }, [initialItems, normalizeItem, storageKey]);

  const persist = useCallback(
    (nextItems) => {
      setItems(nextItems);
      localStorage.setItem(storageKey, JSON.stringify(nextItems));
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
      const nextItems = items.map((item) =>
        item.id === id ? normalizeItem({ ...item, ...patch, updatedAt: new Date().toISOString() }) : item,
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

  return { items, loading, addItem, updateItem, deleteItem };
}
