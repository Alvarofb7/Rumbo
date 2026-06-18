import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { useLocalCollection } from './useLocalCollection';

function serializeDoc(document) {
  const data = document.data();
  return {
    id: document.id,
    ...data,
    createdAt: data.createdAt?.toDate?.().toISOString?.() || data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || new Date().toISOString(),
  };
}

const identity = (item) => item;

export function useUserCollection(user, collectionName, initialItems = [], options = {}) {
  const normalizeItem = options.normalizeItem || identity;
  const getMigration = options.getMigration;
  const safeUid = user?.uid?.replaceAll(':', '_') || 'anonymous';
  const local = useLocalCollection(`rumbo.${safeUid}.${collectionName}`, initialItems, normalizeItem);
  const [remoteItems, setRemoteItems] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(Boolean(isFirebaseConfigured && user && !user.isLocal));

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !user || user.isLocal) return undefined;

    setRemoteLoading(true);
    const ref = collection(db, 'users', user.uid, collectionName);
    const ordered = query(ref, orderBy('createdAt', 'desc'));

    return onSnapshot(
      ordered,
      (snapshot) => {
        setRemoteItems(snapshot.docs.map((document) => normalizeItem(serializeDoc(document))));
        setRemoteLoading(false);

        if (getMigration) {
          const migrations = snapshot.docs.flatMap((document) => {
            const migration = getMigration(document.data());
            const patch = { ...migration.set };
            migration.remove.forEach((field) => {
              patch[field] = deleteField();
            });
            if (!Object.keys(patch).length) return [];
            return updateDoc(document.ref, { ...patch, updatedAt: serverTimestamp() });
          });
          if (migrations.length) void Promise.allSettled(migrations);
        }
      },
      () => setRemoteLoading(false),
    );
  }, [collectionName, getMigration, normalizeItem, user]);

  const addItem = useCallback(
    async (item) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.addItem(item);
      const ref = collection(db, 'users', user.uid, collectionName);
      const payload = {
        ...normalizeItem(item),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const created = await addDoc(ref, payload);
      return { id: created.id, ...item };
    },
    [collectionName, local, normalizeItem, user],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.updateItem(id, patch);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      const payload = normalizeItem(patch);
      await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
      return { id, ...payload };
    },
    [collectionName, local, normalizeItem, user],
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.deleteItem(id);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      return deleteDoc(ref);
    },
    [collectionName, local, user],
  );

  if (!isFirebaseConfigured || !db || !user || user.isLocal) return local;

  return {
    items: remoteItems,
    loading: remoteLoading,
    addItem,
    updateItem,
    deleteItem,
  };
}
