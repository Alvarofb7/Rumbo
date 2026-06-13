import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
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

export function useUserCollection(user, collectionName, initialItems = []) {
  const safeUid = user?.uid?.replaceAll(':', '_') || 'anonymous';
  const local = useLocalCollection(`rumbo.${safeUid}.${collectionName}`, initialItems);
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
        setRemoteItems(snapshot.docs.map(serializeDoc));
        setRemoteLoading(false);
      },
      () => setRemoteLoading(false),
    );
  }, [collectionName, user]);

  const addItem = useCallback(
    async (item) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.addItem(item);
      const ref = collection(db, 'users', user.uid, collectionName);
      const payload = {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const created = await addDoc(ref, payload);
      return { id: created.id, ...item };
    },
    [collectionName, local, user],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.updateItem(id, patch);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
      return { id, ...patch };
    },
    [collectionName, local, user],
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
