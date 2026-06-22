import { describe, expect, it } from 'vitest';
import { serializeFirestoreDocument, withoutDocumentId } from './firestoreData';

describe('Firestore document identity', () => {
  it('always trusts the real Firestore document id', () => {
    const document = {
      id: 'real-document-id',
      data: () => ({ id: 'duplicated-legacy-id', name: 'Bar Moli Bermejales' }),
    };

    expect(serializeFirestoreDocument(document)).toMatchObject({
      id: 'real-document-id',
      name: 'Bar Moli Bermejales',
    });
  });

  it('never persists the client id inside a document', () => {
    expect(withoutDocumentId({ id: 'client-id', name: 'Lugar' })).toEqual({ name: 'Lugar' });
  });
});
