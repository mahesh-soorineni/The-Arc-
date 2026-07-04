/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  browserLocalPersistence,
  inMemoryPersistence,
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged as fbOnAuthStateChanged
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize the Firebase client instance
let app: any;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.error("Firebase App initialization failed:", e);
}

// Recursive safe Proxy to avoid client-side crashes on Firestore operations when DB creation is blocked
const makeMockDbProxy = (): any => {
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop === 'type') return 'firestore';
      return makeMockDbProxy();
    },
    apply() {
      return makeMockDbProxy();
    }
  };
  return new Proxy(() => {}, handler);
};

let db: any;
try {
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL */
} catch (e) {
  console.warn("Firestore initialization failed. Using safety mock proxy.", e);
  db = makeMockDbProxy();
}

let auth: any;
try {
  // Use custom persistence configurations to avoid throwing SecurityError on localStorage/indexedDB lookups in iframe sandboxes
  auth = initializeAuth(app, {
    persistence: [browserLocalPersistence, inMemoryPersistence]
  });
} catch (e) {
  try {
    auth = getAuth(app);
  } catch (err) {
    console.warn("Auth initialization failed. Using dummy in-memory authentication.", err);
    auth = {
      currentUser: null,
      onAuthStateChanged: (cb: any) => {
        cb(null);
        return () => {};
      },
      registerOnAuthStateChanged: (cb: any) => {
        cb(null);
        return () => {};
      }
    };
  }
}

let googleAuthProvider: any;
try {
  googleAuthProvider = new GoogleAuthProvider();
} catch (e) {
  googleAuthProvider = {};
}

export { app, db, auth, googleAuthProvider };

export function onAuthStateChanged(authInstance: any, callback: (user: any) => void) {
  if (!authInstance || typeof authInstance.onAuthStateChanged !== 'function') {
    if (authInstance && typeof authInstance.registerOnAuthStateChanged === 'function') {
      return authInstance.registerOnAuthStateChanged(callback);
    }
    callback(null);
    return () => {};
  }
  try {
    return fbOnAuthStateChanged(authInstance, callback);
  } catch (e) {
    console.warn("fbOnAuthStateChanged failed, falling back to dummy", e);
    callback(null);
    return () => {};
  }
}

export async function signInWithGoogle() {
  if (!auth || !signInWithPopup) {
    throw new Error("Authentication is not supported in this restricted sandbox environment.");
  }
  return signInWithPopup(auth, googleAuthProvider);
}

export async function logout() {
  if (!auth || !signOut) return;
  try {
    return await signOut(auth);
  } catch (e) {
    console.error("SignOut failed:", e);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
