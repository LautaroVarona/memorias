"use client";

import { useState } from "react";

interface ExpandableTextProps {
  text: string;
  clampLines?: 2 | 3;
  className?: string;
}

export function ExpandableText({ text, clampLines = 2, className = "" }: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 100 || text.split(/\s+/).length > 25;

  if (!isLong) {
    return <p className={`text-sm leading-relaxed ${className || "text-slate-700"}`}>{text}</p>;
  }

  return (
    <div>
      <p
        className={`text-sm leading-relaxed ${className || "text-slate-700"} ${
          open ? "line-clamp-none whitespace-pre-wrap" : clampLines === 2 ? "line-clamp-2" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
      >
        {open ? "Ocultar texto" : "Ver texto completo"}
      </button>
    </div>
  );
}
