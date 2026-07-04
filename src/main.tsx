// Safe polyfills for restricted iframe/browser environments where storage access throws SecurityErrors
try {
  const testKey = '__storage_test__';
  window.localStorage.setItem(testKey, testKey);
  window.localStorage.removeItem(testKey);
} catch (e) {
  console.warn('The Arc: LocalStorage blocked or restricted. Fallback in-memory Storage running.');
  const lStore: Record<string, string> = {};
  const mockLStorage: Storage = {
    getItem: (key: string) => lStore[key] || null,
    setItem: (key: string, value: string) => { lStore[key] = String(value); },
    removeItem: (key: string) => { delete lStore[key]; },
    clear: () => { Object.keys(lStore).forEach(k => delete lStore[k]); },
    key: (index: number) => Object.keys(lStore)[index] || null,
    get length() { return Object.keys(lStore).length; }
  };
  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockLStorage,
      writable: true,
      configurable: true
    });
  } catch (err1) {
    try {
      Object.defineProperty(Window.prototype, 'localStorage', {
        get() { return mockLStorage; },
        configurable: true
      });
    } catch (err2) {
      console.warn('The Arc: Cannot overwrite localStorage on window protocol. Standard operations safe.', err2);
    }
  }
}

try {
  const testKey = '__storage_test__';
  window.sessionStorage.setItem(testKey, testKey);
  window.sessionStorage.removeItem(testKey);
} catch (e) {
  console.warn('The Arc: SessionStorage blocked or restricted. Fallback in-memory Storage running.');
  const sStore: Record<string, string> = {};
  const mockSStorage: Storage = {
    getItem: (key: string) => sStore[key] || null,
    setItem: (key: string, value: string) => { sStore[key] = String(value); },
    removeItem: (key: string) => { delete sStore[key]; },
    clear: () => { Object.keys(sStore).forEach(k => delete sStore[k]); },
    key: (index: number) => Object.keys(sStore)[index] || null,
    get length() { return Object.keys(sStore).length; }
  };
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSStorage,
      writable: true,
      configurable: true
    });
  } catch (err1) {
    try {
      Object.defineProperty(Window.prototype, 'sessionStorage', {
        get() { return mockSStorage; },
        configurable: true
      });
    } catch (err2) {
      console.warn('The Arc: Cannot overwrite sessionStorage on window protocol. Standard operations safe.', err2);
    }
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
