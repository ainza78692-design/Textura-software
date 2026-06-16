type StoreValue = string | null;

function isBrowser() {
  return typeof window !== "undefined";
}

export async function getStoredString(key: string, legacyKey?: string): Promise<StoreValue> {
  return getLocalStorageString(key) ?? getLocalStorageString(legacyKey);
}

export async function setStoredString(key: string, value: string, legacyKey?: string) {
  setLocalStorageString(key, value);
  removeLocalStorageString(legacyKey);
}

export async function removeStoredString(key: string, legacyKey?: string) {
  removeLocalStorageString(key);
  removeLocalStorageString(legacyKey);
}

function getLocalStorageString(key?: string) {
  if (!isBrowser() || !key) return null;
  return window.localStorage.getItem(key);
}

function setLocalStorageString(key: string, value: string) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, value);
}

function removeLocalStorageString(key?: string) {
  if (!isBrowser() || !key) return;
  window.localStorage.removeItem(key);
}
