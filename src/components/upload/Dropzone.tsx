"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatFileQueueLabel } from "@/lib/files/file-identity";

const ACCEPTED_EXT = /\.(xlsx|xls|xlsm|doc|docx|rtf|pdf)$/i;

function fileKey(f: File): string {
  return `${f.name}-${f.size}-${f.lastModified}`;
}

function filterValidFiles(fileList: FileList | null): File[] {
  if (!fileList?.length) return [];
  return Array.from(fileList).filter((f) => ACCEPTED_EXT.test(f.name));
}

function mergeFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map(fileKey));
  const merged = [...existing];
  for (const f of incoming) {
    const key = fileKey(f);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(f);
    }
  }
  return merged;
}

interface DropzoneProps {
  onFilesSelected?: (files: File[]) => void;
  disableInteraction?: boolean;
}

export function Dropzone({ onFilesSelected, disableInteraction = false }: DropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const onFilesSelectedRef = useRef(onFilesSelected);

  useEffect(() => {
    onFilesSelectedRef.current = onFilesSelected;
  }, [onFilesSelected]);

  useEffect(() => {
    onFilesSelectedRef.current?.(selected);
  }, [selected]);

  const applyFiles = useCallback(
    (incoming: File[]) => {
      if (!incoming.length || disableInteraction) return;
      setSelected((prev) => mergeFiles(prev, incoming));
    },
    [disableInteraction]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      const valid = filterValidFiles(fileList);
      applyFiles(valid);
      if (inputRef.current) inputRef.current.value = "";
    },
    [applyFiles]
  );

  const removeFile = useCallback(
    (key: string) => {
      if (disableInteraction) return;
      setSelected((prev) => prev.filter((f) => fileKey(f) !== key));
    },
    [disableInteraction]
  );

  const clearAll = useCallback(() => {
    if (disableInteraction) return;
    setSelected([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [disableInteraction]);

  return (
    <div className={disableInteraction ? "pointer-events-none opacity-50" : undefined}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disableInteraction) handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
        } ${disableInteraction ? "" : "cursor-pointer hover:border-blue-400"}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.xlsm,.doc,.docx,.rtf,.pdf"
          className="hidden"
          id={inputId}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <label htmlFor={inputId} className={disableInteraction ? "" : "cursor-pointer"}>
          <p className="text-sm font-medium text-slate-700">
            Arrastra archivos aquí (libro de cierre, memorias…)
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Puedes añadirlos de uno en uno desde carpetas distintas
          </p>
          <p className="mt-0.5 text-xs text-slate-400">o haz clic para seleccionar</p>
        </label>
      </div>

      {selected.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">
              {selected.length} archivo(s) en cola
            </p>
            {!disableInteraction && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-slate-500 hover:text-red-600 hover:underline"
              >
                Quitar todos
              </button>
            )}
          </div>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {selected.map((f) => {
              const key = fileKey(f);
              const label = formatFileQueueLabel(f, selected);
              return (
                <li key={key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <span className="min-w-0 flex-1 truncate">
                    {label}{" "}
                    <span className="text-slate-400">({(f.size / 1024).toFixed(1)} KB)</span>
                  </span>
                  {!disableInteraction && (
                    <button
                      type="button"
                      onClick={() => removeFile(key)}
                      className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                      aria-label={`Quitar ${f.name}`}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
