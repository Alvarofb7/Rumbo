import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  enableNetwork,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db || !user || user.isLocal) return undefined;

    setRemoteLoading(true);
    const ref = collection(db, 'users', user.uid, collectionName);
    const ordered = query(ref, orderBy('createdAt', 'desc'));

    return onSnapshot(
      ordered,
      { includeMetadataChanges: true },
      (snapshot) => {
        setRemoteItems(snapshot.docs.map((document) => normalizeItem(serializeDoc(document))));
        setRemoteLoading(false);
        setPendingWrites(snapshot.metadata.hasPendingWrites);
        setSyncError('');

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
      (error) => {
        setRemoteLoading(false);
        setSyncError(error.message || 'No se han podido sincronizar los datos.');
      },
    );
  }, [collectionName, getMigration, normalizeItem, user]);

  const addItem = useCallback(
    async (item) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.addItem(item);
      const ref = collection(db, 'users', user.uid, collectionName);
      const created = item.id ? doc(ref, item.id) : doc(ref);
      const data = { ...normalizeItem(item) };
      delete data.id;
      const payload = {
        ...data,
        createdAt: item.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      setPendingWrites(true);
      void setDoc(created, payload).catch((error) => setSyncError(error.message || 'No se ha podido guardar el cambio.'));
      return { id: created.id, ...item };
    },
    [collectionName, local, normalizeItem, user],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.updateItem(id, patch);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      const payload = normalizeItem(patch);
      setPendingWrites(true);
      void updateDoc(ref, { ...payload, updatedAt: serverTimestamp() }).catch((error) =>
        setSyncError(error.message || 'No se ha podido guardar el cambio.'),
      );
      return { id, ...payload };
    },
    [collectionName, local, normalizeItem, user],
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.deleteItem(id);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      setPendingWrites(true);
      void deleteDoc(ref).catch((error) => setSyncError(error.message || 'No se ha podido eliminar el lugar.'));
      return undefined;
    },
    [collectionName, local, user],
  );

  const retrySync = useCallback(async () => {
    if (!db) return;
    setSyncError('');
    try {
      await enableNetwork(db);
    } catch (error) {
      setSyncError(error.message || 'No se ha podido reanudar la sincronización.');
    }
  }, []);

  if (!isFirebaseConfigured || !db || !user || user.isLocal) return local;

  return {
    items: remoteItems,
    loading: remoteLoading,
    addItem,
    updateItem,
    deleteItem,
    retrySync,
    syncState: {
      status: syncError ? 'error' : !networkOnline ? 'offline' : pendingWrites ? 'pending' : 'synced',
      pending: pendingWrites,
      offline: !networkOnline,
      error: syncError,
    },
  };
}
