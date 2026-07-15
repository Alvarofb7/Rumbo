import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  auth,
  completeRedirectSignIn,
  isFirebaseConfigured,
  localFallbackEnabled,
  signInWithGoogleProvider,
} from '../lib/firebase';
import { readStorageJson, removeStorageValue, writeStorageJson } from '../lib/storage';

const AuthContext = createContext(null);
const localUserKey = 'rumbo.localUser';

function buildLocalUser(email = 'demo@rumbo.local') {
  const name = email.split('@')[0].replace(/[._-]/g, ' ');
  return {
    uid: `local:${email}`,
    email,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    photoURL: '',
    isLocal: true,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(readStorageJson(localUserKey, null, { validate: (value) => Boolean(value?.uid), quarantine: false }));
      setLoading(false);
      return undefined;
    }

    completeRedirectSignIn().catch((error) => setAuthError(error.message));

    return onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
  }, []);

  const actions = useMemo(
    () => ({
      async signIn(email, password) {
        setAuthError('');

        if (isFirebaseConfigured && auth) {
          return signInWithEmailAndPassword(auth, email, password);
        }

        if (!localFallbackEnabled) throw new Error('Firebase no está configurado.');
        const localUser = buildLocalUser(email);
        if (!writeStorageJson(localUserKey, localUser)) throw new Error('No se ha podido guardar la sesión local.');
        setUser(localUser);
        return localUser;
      },
      async signUp(email, password) {
        setAuthError('');

        if (isFirebaseConfigured && auth) {
          return createUserWithEmailAndPassword(auth, email, password);
        }

        if (!localFallbackEnabled) throw new Error('Firebase no está configurado.');
        const localUser = buildLocalUser(email);
        if (!writeStorageJson(localUserKey, localUser)) throw new Error('No se ha podido guardar la sesión local.');
        setUser(localUser);
        return localUser;
      },
      async signInWithGoogle() {
        setAuthError('');

        if (isFirebaseConfigured && auth) {
          return signInWithGoogleProvider();
        }

        if (!localFallbackEnabled) throw new Error('Firebase no está configurado.');
        const localUser = buildLocalUser('google.demo@rumbo.local');
        localUser.displayName = 'Google demo';
        if (!writeStorageJson(localUserKey, localUser)) throw new Error('No se ha podido guardar la sesión local.');
        setUser(localUser);
        return localUser;
      },
      async continueDemo() {
        const localUser = buildLocalUser();
        localUser.displayName = 'Modo demo';
        if (!writeStorageJson(localUserKey, localUser)) throw new Error('No se ha podido guardar la sesión local.');
        setUser(localUser);
        return localUser;
      },
      async signOut() {
        if (isFirebaseConfigured && auth && !user?.isLocal) {
          await firebaseSignOut(auth);
        }
        if (user?.isLocal && !removeStorageValue(localUserKey)) throw new Error('No se ha podido cerrar la sesión local.');
        setUser(null);
      },
      clearError() {
        setAuthError('');
      },
    }),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      firebaseReady: isFirebaseConfigured,
      ...actions,
    }),
    [actions, authError, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}
