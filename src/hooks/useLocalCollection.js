import { useCallback, useEffect, useState } from 'react';

export function useLocalCollection(storageKey, initialItems = []) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setItems(JSON.parse(stored));
    } else {
      setItems(initialItems);
      localStorage.setItem(storageKey, JSON.stringify(initialItems));
    }
    setLoading(false);
  }, [initialItems, storageKey]);

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
      const nextItem = {
        ...item,
        id: item.id || crypto.randomUUID(),
        createdAt: item.createdAt || now,
        updatedAt: now,
      };
      persist([nextItem, ...items]);
      return nextItem;
    },
    [items, persist],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      const nextItems = items.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
      persist(nextItems);
      return nextItems.find((item) => item.id === id);
    },
    [items, persist],
  );

  const deleteItem = useCallback(
    async (id) => {
      persist(items.filter((item) => item.id !== id));
    },
    [items, persist],
  );

  return { items, loading, addItem, updateItem, deleteItem };
}
