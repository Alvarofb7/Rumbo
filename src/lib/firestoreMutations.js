export async function commitFirestoreMutation({
  execute,
  incrementPendingWrites,
  decrementPendingWrites,
  setSyncError,
  captureDiagnostic,
  diagnosticKey,
  diagnosticContext,
  fallbackMessage,
  offline = false,
  queueTimeoutMs = 1500,
}) {
  incrementPendingWrites();

  const mutation = Promise.resolve().then(execute);
  if (!offline) {
    try {
      return await mutation;
    } catch (error) {
      captureDiagnostic(diagnosticKey, error, diagnosticContext);
      setSyncError(error.message || fallbackMessage);
      throw error;
    } finally {
      decrementPendingWrites();
    }
  }

  return new Promise((resolve, reject) => {
    let completed = false;
    let resolveCompletion;
    const completion = new Promise((resolve) => { resolveCompletion = resolve; });
    const finish = (result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutId);
      decrementPendingWrites();
      resolve(result);
    };
    const timeoutId = setTimeout(() => finish({ queued: true, completion }), queueTimeoutMs);

    mutation.then(
      (result) => {
        resolveCompletion({ result });
        finish({ result, queued: true, completion });
      },
      (error) => {
        captureDiagnostic(diagnosticKey, error, diagnosticContext);
        setSyncError(error.message || fallbackMessage);
        resolveCompletion({ error });
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        decrementPendingWrites();
        reject(error);
      },
    );
  });
}

export async function convertLocalInboxRecommendation({ inboxId, place, addPlace, deleteInbox }) {
  const created = await addPlace(place);
  await deleteInbox(inboxId);
  return created;
}

export async function convertFirestoreInboxRecommendation({
  db,
  userId,
  inboxId,
  place,
  createCollection,
  createDocument,
  createBatch,
  timestamp,
}) {
  const placeCollection = createCollection(db, 'users', userId, 'places');
  const placeData = { ...place };
  const placeId = placeData.id;
  delete placeData.id;
  delete placeData.createdAt;
  delete placeData.updatedAt;
  const placeRef = placeId ? createDocument(placeCollection, placeId) : createDocument(placeCollection);
  const inboxRef = createDocument(db, 'users', userId, 'inbox', inboxId);
  const batch = createBatch(db);

  batch.set(placeRef, {
    ...placeData,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  });
  batch.delete(inboxRef);
  await batch.commit();

  return { ...placeData, id: placeRef.id };
}
