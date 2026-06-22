"use client";

import { HighlightText } from "./HighlightText";
import { MemoriaPipeTable } from "./MemoriaPipeTable";
import { segmentMemoriaContent } from "./parse-pipe-table";

interface MemoriaContentRendererProps {
  content: string;
  highlightText?: string;
}

export function MemoriaContentRenderer({ content, highlightText }: MemoriaContentRendererProps) {
  const segments = segmentMemoriaContent(content);

  if (segments.length === 0) {
    return <p className="text-sm italic text-slate-400">Sin contenido detectado</p>;
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.type === "table" ? (
          <MemoriaPipeTable key={`t-${i}`} rows={seg.rows} />
        ) : (
          <p
            key={`p-${i}`}
            className="whitespace-pre-wrap text-sm leading-relaxed text-slate-400"
          >
            <HighlightText text={seg.content} query={highlightText} />
          </p>
        )
      )}
    </div>
  );
}
