export function serializeFirestoreDocument(document) {
  const data = document.data();
  return {
    ...data,
    id: document.id,
    createdAt: data.createdAt?.toDate?.().toISOString?.() || data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || new Date().toISOString(),
  };
}

export function withoutDocumentId(record = {}) {
  const data = { ...record };
  delete data.id;
  return data;
}
