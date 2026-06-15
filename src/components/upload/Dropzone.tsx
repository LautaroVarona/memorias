"use client";

import { useCallback, useId, useRef, useState } from "react";

interface DropzoneProps {
  onFilesSelected?: (files: File[]) => void;
  disableInteraction?: boolean;
}

export function Dropzone({ onFilesSelected, disableInteraction = false }: DropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length || disableInteraction) return;
      const valid = Array.from(fileList).filter((f) =>
        /\.(xlsx|xls|xlsm|doc|docx|rtf|pdf)$/i.test(f.name)
      );
      setSelected(valid);
      onFilesSelected?.(valid);
    },
    [disableInteraction, onFilesSelected]
  );

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
            Arrastra el libro de cierre (.xlsm/.xlsx) y la memoria (.doc/.docx/.pdf) aquí
          </p>
          <p className="mt-1 text-xs text-slate-500">o haz clic para seleccionar</p>
        </label>
      </div>
      {selected.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {selected.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              {f.name} ({(f.size / 1024).toFixed(1)} KB)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
