export interface AutoSaver {
  schedule: () => void
  flush: () => Promise<void>
  cancel: () => void
  destroy: () => void
}

export interface IndexedDbStoreOptions {
  dbName?: string
  storeName?: string
}

export interface IndexedDbAutoSaverOptions<T> extends IndexedDbStoreOptions {
  key?: string
  debounceMs?: number
  idleTimeout?: number
  getValue: () => T | Promise<T>
  onSaved?: (value: T) => void
  onError?: (err: unknown) => void
}

export interface IndexedDbValueStore<T> {
  get: (key: string) => Promise<T | null>
  set: (key: string, value: T) => Promise<void>
  remove: (key: string) => Promise<void>
  clear: () => Promise<void>
}

interface StoredRecord<T> {
  key: string
  value: T
  updatedAt: string
}

const DEFAULT_DB_NAME = 'hupheai-atelier'
const DEFAULT_STORE_NAME = 'autosave'
const DEFAULT_AUTOSAVE_KEY = 'hupheai:atelier:auto-save'

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`IndexedDB upgrade blocked for ${dbName}`))
  })
}

async function withStore<T>(
  options: Required<IndexedDbStoreOptions>,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDatabase(options.dbName, options.storeName)

  try {
    const tx = db.transaction(options.storeName, mode)
    const store = tx.objectStore(options.storeName)
    const result = await run(store)
    const value = result instanceof IDBRequest ? await requestToPromise(result) : result

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    return value
  } finally {
    db.close()
  }
}

export function createIndexedDbValueStore<T>({
  dbName = DEFAULT_DB_NAME,
  storeName = DEFAULT_STORE_NAME,
}: IndexedDbStoreOptions = {}): IndexedDbValueStore<T> {
  const options = { dbName, storeName }

  return {
    async get(key: string) {
      const record = await withStore<StoredRecord<T> | undefined>(options, 'readonly', (store) => store.get(key))
      return record?.value ?? null
    },

    async set(key: string, value: T) {
      await withStore<IDBValidKey>(options, 'readwrite', (store) =>
        store.put({ key, value, updatedAt: new Date().toISOString() } satisfies StoredRecord<T>),
      )
    },

    async remove(key: string) {
      await withStore<undefined>(options, 'readwrite', (store) => store.delete(key))
    },

    async clear() {
      await withStore<undefined>(options, 'readwrite', (store) => store.clear())
    },
  }
}

export async function getAutoSaveDraft<T>(
  key = DEFAULT_AUTOSAVE_KEY,
  options?: IndexedDbStoreOptions,
): Promise<T | null> {
  return createIndexedDbValueStore<T>(options).get(key)
}

export async function setAutoSaveDraft<T>(
  value: T,
  key = DEFAULT_AUTOSAVE_KEY,
  options?: IndexedDbStoreOptions,
): Promise<void> {
  await createIndexedDbValueStore<T>(options).set(key, value)
}

export async function removeAutoSaveDraft(
  key = DEFAULT_AUTOSAVE_KEY,
  options?: IndexedDbStoreOptions,
): Promise<void> {
  await createIndexedDbValueStore<unknown>(options).remove(key)
}

export async function migrateLocalStorageDraft<T>(
  key = DEFAULT_AUTOSAVE_KEY,
  options?: IndexedDbStoreOptions & { removeAfterMigration?: boolean },
): Promise<T | null> {
  if (typeof window === 'undefined' || !window.localStorage) return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return getAutoSaveDraft<T>(key, options)

  const parsed = JSON.parse(raw) as T
  await setAutoSaveDraft(parsed, key, options)

  if (options?.removeAfterMigration ?? true) {
    window.localStorage.removeItem(key)
  }

  return parsed
}

export function createIndexedDbAutoSaver<T>({
  key = DEFAULT_AUTOSAVE_KEY,
  dbName = DEFAULT_DB_NAME,
  storeName = DEFAULT_STORE_NAME,
  debounceMs = 1500,
  idleTimeout = 2000,
  getValue,
  onSaved,
  onError = console.error,
}: IndexedDbAutoSaverOptions<T>): AutoSaver {
  const store = createIndexedDbValueStore<T>({ dbName, storeName })
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let idleHandle: number | null = null
  let isSaving = false
  let saveQueued = false
  let destroyed = false

  const clearIdle = () => {
    if (idleHandle === null) return
    if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle)
    } else {
      clearTimeout(idleHandle)
    }
    idleHandle = null
  }

  const cancel = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    clearIdle()
  }

  const performSave = async (): Promise<void> => {
    if (destroyed) return
    if (isSaving) {
      saveQueued = true
      return
    }

    isSaving = true
    try {
      do {
        saveQueued = false
        const value = await getValue()
        await store.set(key, value)
        onSaved?.(value)
      } while (saveQueued && !destroyed)
    } catch (err) {
      onError(err)
    } finally {
      isSaving = false
    }
  }

  const idleSave = () => {
    if (destroyed) return
    clearIdle()

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => {
        idleHandle = null
        void performSave()
      }, { timeout: idleTimeout })
    } else {
      idleHandle = window.setTimeout(() => {
        idleHandle = null
        void performSave()
      }, 0)
    }
  }

  const schedule = () => {
    if (destroyed) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      idleSave()
    }, debounceMs)
  }

  const flush = async () => {
    cancel()
    await performSave()
  }

  const destroy = () => {
    destroyed = true
    cancel()
  }

  return { schedule, flush, cancel, destroy }
}
