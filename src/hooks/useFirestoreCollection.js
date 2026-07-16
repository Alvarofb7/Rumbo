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
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { captureDiagnostic } from '../lib/diagnostics';
import { serializeFirestoreDocument, withoutDocumentId } from '../lib/firestoreData';
import {
  commitDurableFirestoreMutation,
  commitFirestoreMutation,
  convertFirestoreInboxRecommendation,
  convertLocalInboxRecommendation,
} from '../lib/firestoreMutations';
import { useLocalCollection } from './useLocalCollection';

const identity = (item) => item;
const durableIdempotencyKeyPattern = /^import_[A-Za-z0-9_-]{16,96}$/;

export function useUserCollection(user, collectionName, initialItems = [], options = {}) {
  const normalizeItem = options.normalizeItem || identity;
  const getMigration = options.getMigration;
  const safeUid = user?.uid?.replaceAll(':', '_') || 'anonymous';
  const local = useLocalCollection(`rumbo.${safeUid}.${collectionName}`, initialItems, normalizeItem);
  const [remoteItems, setRemoteItems] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(Boolean(isFirebaseConfigured && user && !user.isLocal));
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const [snapshotPendingWrites, setSnapshotPendingWrites] = useState(false);
  const [inFlightWrites, setInFlightWrites] = useState(0);
  const pendingWrites = snapshotPendingWrites || inFlightWrites > 0;
  const incrementPendingWrites = useCallback(() => setInFlightWrites((count) => count + 1), []);
  const decrementPendingWrites = useCallback(() => setInFlightWrites((count) => Math.max(0, count - 1)), []);
  const [reconnecting, setReconnecting] = useState(false);
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
      async (snapshot) => {
        setRemoteItems(snapshot.docs.map((document) => normalizeItem(serializeFirestoreDocument(document))));
        setRemoteLoading(false);
        setSnapshotPendingWrites(snapshot.metadata.hasPendingWrites);
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
          if (migrations.length) {
            try {
              await Promise.all(migrations);
            } catch (error) {
              captureDiagnostic('sync.migration', error, { collection: collectionName });
              setSyncError(error.message || 'No se han podido actualizar los datos.');
            }
          }
        }
      },
      (error) => {
        captureDiagnostic('sync.snapshot', error, { collection: collectionName });
        setRemoteLoading(false);
        setSyncError(error.message || 'No se han podido sincronizar los datos.');
      },
    );
  }, [collectionName, getMigration, normalizeItem, user]);

  const addItem = useCallback(
    async (item, { durable = false, idempotencyKey } = {}) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) {
        const created = await local.addItem(item);
        return durable ? { ...created, committed: true } : created;
      }
      if (durable && idempotencyKey && !durableIdempotencyKeyPattern.test(idempotencyKey)) {
        throw new Error('Invalid durable idempotency key');
      }
      const ref = collection(db, 'users', user.uid, collectionName);
      const created = durable && idempotencyKey ? doc(ref, idempotencyKey) : item.id ? doc(ref, item.id) : doc(ref);
      const data = withoutDocumentId(normalizeItem(item));
      delete data.createdAt;
      delete data.updatedAt;
      const payload = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (durable) {
        const result = await commitDurableFirestoreMutation({
          execute: () => runTransaction(db, async (transaction) => {
            const existing = await transaction.get(created);
            if (existing.exists()) return { id: created.id };
            transaction.set(created, payload);
            return { id: created.id };
          }),
          incrementPendingWrites,
          decrementPendingWrites,
          setSyncError,
          captureDiagnostic,
          diagnosticKey: 'sync.create-durable',
          diagnosticContext: { collection: collectionName },
          fallbackMessage: 'No se ha podido confirmar la importación.',
        });
        return { ...item, id: created.id, committed: result.committed };
      }
      const result = await commitFirestoreMutation({
        execute: () => setDoc(created, payload),
        incrementPendingWrites,
        decrementPendingWrites,
        setSyncError,
        captureDiagnostic,
        diagnosticKey: 'sync.create',
        diagnosticContext: { collection: collectionName },
        fallbackMessage: 'No se ha podido guardar el cambio.',
        offline: !networkOnline,
      });
      return { ...item, id: created.id, queued: Boolean(result?.queued), completion: result?.completion };
    },
    [collectionName, decrementPendingWrites, incrementPendingWrites, local, networkOnline, normalizeItem, user],
  );

  const updateItem = useCallback(
    async (id, patch) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.updateItem(id, patch);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      const payload = withoutDocumentId(normalizeItem(patch));
      delete payload.createdAt;
      delete payload.updatedAt;
      const result = await commitFirestoreMutation({
        execute: () => updateDoc(ref, { ...payload, updatedAt: serverTimestamp() }),
        incrementPendingWrites,
        decrementPendingWrites,
        setSyncError,
        captureDiagnostic,
        diagnosticKey: 'sync.update',
        diagnosticContext: { collection: collectionName },
        fallbackMessage: 'No se ha podido guardar el cambio.',
        offline: !networkOnline,
      });
      return { ...payload, id, queued: Boolean(result?.queued) };
    },
    [collectionName, decrementPendingWrites, incrementPendingWrites, local, networkOnline, normalizeItem, user],
  );

  const deleteItem = useCallback(
    async (id) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) return local.deleteItem(id);
      const ref = doc(db, 'users', user.uid, collectionName, id);
      const result = await commitFirestoreMutation({
        execute: () => deleteDoc(ref),
        incrementPendingWrites,
        decrementPendingWrites,
        setSyncError,
        captureDiagnostic,
        diagnosticKey: 'sync.delete',
        diagnosticContext: { collection: collectionName },
        fallbackMessage: 'No se ha podido eliminar el lugar.',
        offline: !networkOnline,
      });
      return result;
    },
    [collectionName, decrementPendingWrites, incrementPendingWrites, local, networkOnline, user],
  );

  const retrySync = useCallback(async () => {
    if (!db) return;
    setReconnecting(true);
    try {
      await enableNetwork(db);
      setSyncError('');
    } catch (error) {
      captureDiagnostic('sync.retry', error);
      setSyncError(error.message || 'No se ha podido reanudar la sincronización.');
    } finally {
      setReconnecting(false);
    }
  }, []);

  const convertInboxToPlace = useCallback(
    async (inboxId, place, placesStore) => {
      if (!isFirebaseConfigured || !db || !user || user.isLocal) {
        return convertLocalInboxRecommendation({
          inboxId,
          place,
          addPlace: placesStore.addItem,
          deleteInbox: local.deleteItem,
        });
      }

      const payload = withoutDocumentId(normalizeItem(place));
      return commitFirestoreMutation({
        execute: () => convertFirestoreInboxRecommendation({
          db,
          userId: user.uid,
          inboxId,
          place: payload,
          createCollection: collection,
          createDocument: doc,
          createBatch: writeBatch,
          timestamp: serverTimestamp,
        }),
        incrementPendingWrites,
        decrementPendingWrites,
        setSyncError,
        captureDiagnostic,
        diagnosticKey: 'sync.convert-inbox',
        diagnosticContext: { collection: collectionName },
        fallbackMessage: 'No se ha podido guardar la recomendación.',
        offline: !networkOnline,
      });
    },
    [collectionName, decrementPendingWrites, incrementPendingWrites, local.deleteItem, networkOnline, normalizeItem, user],
  );

  if (!isFirebaseConfigured || !db || !user || user.isLocal) {
    return {
      ...local,
      convertInboxToPlace,
    };
  }

  return {
    items: remoteItems,
    loading: remoteLoading,
    addItem,
    updateItem,
    deleteItem,
    convertInboxToPlace,
    retrySync,
    syncState: {
      status: reconnecting ? 'reconnecting' : syncError ? 'error' : !networkOnline ? 'offline' : pendingWrites ? 'pending' : 'synced',
      pending: pendingWrites,
      reconnecting,
      offline: !networkOnline,
      error: syncError,
    },
  };
}
