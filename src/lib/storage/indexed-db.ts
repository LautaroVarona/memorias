const DB_NAME = "memorias";
const DB_VERSION = 1;

type StoreName = "expedientes" | "archivos" | "archivoBlobs" | "validaciones" | "reglas";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("expedientes")) {
        db.createObjectStore("expedientes", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("archivos")) {
        const archivos = db.createObjectStore("archivos", { keyPath: "id" });
        archivos.createIndex("expedienteId", "expedienteId", { unique: false });
      }
      if (!db.objectStoreNames.contains("archivoBlobs")) {
        db.createObjectStore("archivoBlobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("validaciones")) {
        const validaciones = db.createObjectStore("validaciones", { keyPath: "id" });
        validaciones.createIndex("expedienteId", "expedienteId", { unique: false });
      }
      if (!db.objectStoreNames.contains("reglas")) {
        const reglas = db.createObjectStore("reglas", { keyPath: "id" });
        reglas.createIndex("expedienteId", "expedienteId", { unique: false });
      }
    };
  });
}

async function withStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);

    if (result instanceof Promise) {
      result.then(resolve).catch(reject);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Error en transacción IndexedDB"));
      };
      return;
    }

    result.onsuccess = () => resolve(result.result as T);
    result.onerror = () => reject(result.error ?? new Error("Error en IndexedDB"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Error en transacción IndexedDB"));
    };
  });
}

async function withStores<T>(
  storeNames: StoreName[],
  mode: IDBTransactionMode,
  fn: (stores: Record<StoreName, IDBObjectStore>) => Promise<T>
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(
      storeNames.map((name) => [name, tx.objectStore(name)])
    ) as Record<StoreName, IDBObjectStore>;

    fn(stores)
      .then(resolve)
      .catch(reject);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Error en transacción IndexedDB"));
    };
  });
}

export async function idbGet<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  return withStore(storeName, "readonly", (store) => store.get(key));
}

export async function idbPut<T>(storeName: StoreName, value: T): Promise<void> {
  await withStore(storeName, "readwrite", (store) => store.put(value));
}

export async function idbDelete(storeName: StoreName, key: string): Promise<void> {
  await withStore(storeName, "readwrite", (store) => store.delete(key));
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  return withStore(storeName, "readonly", (store) => store.getAll());
}

export async function idbGetAllByIndex<T>(
  storeName: StoreName,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  return withStore(storeName, "readonly", (store) => store.index(indexName).getAll(key));
}

export async function idbDeleteByIndex(
  storeName: StoreName,
  indexName: string,
  key: IDBValidKey
): Promise<void> {
  await withStores([storeName], "readwrite", async (stores) => {
    const store = stores[storeName];
    const items = await new Promise<{ id: string }[]>((resolve, reject) => {
      const req = store.index(indexName).getAll(key);
      req.onsuccess = () => resolve(req.result as { id: string }[]);
      req.onerror = () => reject(req.error);
    });
    for (const item of items) {
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(item.id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  });
}

export async function idbPutBlob(id: string, data: ArrayBuffer): Promise<void> {
  await idbPut("archivoBlobs", { id, data });
}

export async function idbGetBlob(id: string): Promise<ArrayBuffer | undefined> {
  const row = await idbGet<{ id: string; data: ArrayBuffer }>("archivoBlobs", id);
  return row?.data;
}

export async function idbDeleteBlob(id: string): Promise<void> {
  await idbDelete("archivoBlobs", id);
}
