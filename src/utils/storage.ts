/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// A secure, sandbox-safe storage utility that wraps localStorage and sessionStorage.
// It detects restricted environment security blocks and falls back to a reliable in-memory storage.

export const safeLocalStorage: Storage = (() => {
  try {
    const testKey = '__storage_test_key__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (e) {
    console.warn('The Arc Storage: LocalStorage is restricted. Using safe in-memory fallback.');
    const store: Record<string, string> = {};
    return {
      getItem: (key: string) => {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      key: (index: number) => {
        return Object.keys(store)[index] || null;
      },
      get length() {
        return Object.keys(store).length;
      }
    } as Storage;
  }
})();

export const safeSessionStorage: Storage = (() => {
  try {
    const testKey = '__storage_test_key__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
    return window.sessionStorage;
  } catch (e) {
    console.warn('The Arc Storage: SessionStorage is restricted. Using safe in-memory fallback.');
    const store: Record<string, string> = {};
    return {
      getItem: (key: string) => {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      key: (index: number) => {
        return Object.keys(store)[index] || null;
      },
      get length() {
        return Object.keys(store).length;
      }
    } as Storage;
  }
})();
