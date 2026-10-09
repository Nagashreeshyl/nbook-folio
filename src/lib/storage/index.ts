import { getLocalDriver } from "./local";
import { FirestoreDriver, isFirestoreConfigured } from "./firestore";
import type { StorageDriver } from "./types";

export * from "./types";

const globalStore = globalThis as unknown as { __nbookDriver?: StorageDriver };

/**
 * Returns the active persistence backend.
 *
 *  - `firestore` when Firebase configuration is present (production or emulator)
 *  - `local`     otherwise — a JSON file store so the app still runs for
 *                developers who have not provisioned a Firebase project yet
 *
 * The choice is made once per process and surfaced in Settings so nobody can
 * mistake local storage for cloud persistence.
 */
export function getStorageDriver(): StorageDriver {
  if (globalStore.__nbookDriver) return globalStore.__nbookDriver;
  globalStore.__nbookDriver = isFirestoreConfigured()
    ? new FirestoreDriver()
    : getLocalDriver();
  return globalStore.__nbookDriver;
}

export type StorageMode = "firestore" | "local";

export function getStorageMode(): StorageMode {
  return getStorageDriver().kind;
}

/** Test hook: force a specific driver. */
export function __setStorageDriver(driver: StorageDriver | undefined): void {
  globalStore.__nbookDriver = driver;
}
