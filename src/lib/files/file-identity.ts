/** Metadatos de identidad de un archivo subido desde el navegador. */
export interface FileUploadMeta {
  size: number;
  lastModified: number;
  fingerprint: string;
  originalName: string;
  relativePath?: string;
}

export function fileFingerprint(name: string, size: number, lastModified: number): string {
  return `${name}|${size}|${lastModified}`;
}

export function fingerprintFromFile(file: File): string {
  return fileFingerprint(file.name, file.size, file.lastModified);
}

export function normalizeRelativePath(file: File): string | undefined {
  const path = file.webkitRelativePath?.replace(/\\/g, "/").trim();
  if (!path || path === file.name) return undefined;
  return path;
}

export function buildUploadMeta(file: File): FileUploadMeta {
  const relativePath = normalizeRelativePath(file);
  return {
    size: file.size,
    lastModified: file.lastModified,
    fingerprint: fingerprintFromFile(file),
    originalName: file.name,
    ...(relativePath ? { relativePath } : {}),
  };
}

export function parseArchivoMetadata(metadata: string | null | undefined): Partial<FileUploadMeta> {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as Partial<FileUploadMeta>;
  } catch {
    return {};
  }
}

/** Comprueba si un archivo del navegador coincide con un registro ya guardado. */
export function matchesStoredFile(metadata: string | null | undefined, file: File): boolean {
  const meta = parseArchivoMetadata(metadata);
  if (meta.fingerprint) {
    return meta.fingerprint === fingerprintFromFile(file);
  }
  return meta.size === file.size && meta.lastModified === file.lastModified;
}

function splitBaseExt(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

/** Nombre visible único dentro del expediente (permite varios archivos con el mismo nombre base). */
export function resolveUniqueDisplayName(file: File, takenNames: Set<string>): string {
  const relativePath = normalizeRelativePath(file);
  if (relativePath && !takenNames.has(relativePath)) {
    return relativePath;
  }

  if (!takenNames.has(file.name)) {
    return file.name;
  }

  const { base, ext } = splitBaseExt(file.name);
  let n = 2;
  while (takenNames.has(`${base} (${n})${ext}`)) {
    n++;
  }
  return `${base} (${n})${ext}`;
}

/** Etiqueta legible en la cola de subida cuando hay nombres repetidos. */
export function formatFileQueueLabel(file: File, allFiles: File[]): string {
  const duplicates = allFiles.filter((f) => f.name === file.name);
  if (duplicates.length <= 1) return file.name;

  const relativePath = normalizeRelativePath(file);
  if (relativePath) return relativePath;

  return `${file.name} [${duplicates.indexOf(file) + 1}/${duplicates.length}]`;
}
