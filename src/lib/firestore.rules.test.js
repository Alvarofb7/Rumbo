import { readFileSync } from 'node:fs';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const now = Timestamp.fromDate(new Date('2026-07-15T00:00:00.000Z'));
let testEnvironment;

function validPlace(overrides = {}) {
  return {
    name: 'Café Rumbo',
    address: 'Calle Mayor 1',
    zone: 'Centro',
    lat: 40.4168,
    lng: -3.7038,
    category: 'cafe',
    tags: ['Brunch'],
    rating: 4.5,
    status: 'wishlist',
    sourceType: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function validInbox(overrides = {}) {
  return {
    title: 'Recomendación',
    address: 'Pendiente de confirmar',
    zone: '',
    lat: '',
    lng: '',
    category: 'other',
    tags: [],
    rating: 0,
    sourceType: 'instagram',
    sourceUrl: 'https://www.instagram.com/reel/example',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function validImportedInbox(overrides = {}) {
  return validInbox({
    importQuality: { confidence: 'medium', coordinateQuality: 'approximate', provenance: 'metadata', warnings: ['APPROXIMATE_COORDINATES'], ambiguity: false, verified: false },
    importWarnings: ['APPROXIMATE_COORDINATES'],
    importAcknowledgedWarnings: ['APPROXIMATE_COORDINATES'],
    importSource: { provider: 'google', inputUrl: 'https://maps.google.com/?q=Cafe', canonicalUrl: 'https://maps.google.com/?q=Cafe', resolvedUrl: 'https://maps.google.com/?q=Cafe', providerId: 'place-1' },
    importDuplicate: { status: 'none', matchedCollection: null, matchedId: null, reasons: [] },
    ...overrides,
  });
}

describe.skipIf(!emulatorAvailable)('Firestore security rules', () => {
  beforeAll(async () => {
    testEnvironment = await initializeTestEnvironment({
      projectId: 'rumbo-test',
      firestore: {
        rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnvironment?.cleanup();
  });

  it('allows an owner to write and read valid place and inbox documents', async () => {
    const db = testEnvironment.authenticatedContext('owner').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'owner', 'places', 'place-1'), validPlace()));
    await assertSucceeds(setDoc(doc(db, 'users', 'owner', 'inbox', 'inbox-1'), validInbox()));
    await expect(getDoc(doc(db, 'users', 'owner', 'places', 'place-1'))).resolves.toMatchObject({ exists: expect.any(Function) });
  });

  it('denies cross-user access', async () => {
    const db = testEnvironment.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users', 'bob', 'places', 'place-1'), validPlace()));
    await assertFails(getDoc(doc(db, 'users', 'bob', 'places', 'place-1')));
  });

  it('denies unknown collections and fields', async () => {
    const db = testEnvironment.authenticatedContext('owner').firestore();
    await assertFails(setDoc(doc(db, 'users', 'owner', 'private', 'record-1'), { value: 'nope' }));
    await assertFails(setDoc(doc(db, 'users', 'owner', 'places', 'place-1'), validPlace({ injected: true })));
  });

  it('denies invalid coordinates, ratings, and oversized strings', async () => {
    const db = testEnvironment.authenticatedContext('owner').firestore();
    await assertFails(setDoc(doc(db, 'users', 'owner', 'places', 'invalid-coordinate'), validPlace({ lat: 91 })));
    await assertFails(setDoc(doc(db, 'users', 'owner', 'places', 'invalid-rating'), validPlace({ rating: 5.1 })));
    await assertFails(setDoc(doc(db, 'users', 'owner', 'inbox', 'oversized'), validInbox({ title: 'x'.repeat(181) })));
  });

  it('allows bounded import metadata while rejecting unexpected keys and invalid metadata types', async () => {
    const db = testEnvironment.authenticatedContext('owner').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'owner', 'inbox', 'imported'), validImportedInbox()));
    await assertFails(setDoc(doc(db, 'users', 'owner', 'inbox', 'unexpected-import-key'), validImportedInbox({ importUnexpected: true })));
    await assertFails(setDoc(doc(db, 'users', 'owner', 'inbox', 'invalid-import-type'), validImportedInbox({ importWarnings: 'APPROXIMATE_COORDINATES' })));
  });

  it('does not allow createdAt to change during an update', async () => {
    await testEnvironment.withSecurityRulesDisabled((context) =>
      setDoc(doc(context.firestore(), 'users', 'owner', 'places', 'existing'), validPlace()),
    );
    const db = testEnvironment.authenticatedContext('owner').firestore();
    await assertFails(setDoc(doc(db, 'users', 'owner', 'places', 'existing'), validPlace({ createdAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')) })));
  });
});
