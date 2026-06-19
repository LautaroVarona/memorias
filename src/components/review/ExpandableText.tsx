"use client";

import { useEffect, useRef, useState } from "react";

interface ExpandableTextProps {
  text: string;
  clampLines?: 2 | 3;
  className?: string;
}

export function ExpandableText({ text, clampLines = 2, className = "" }: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  const clampClass = clampLines === 2 ? "line-clamp-2" : "line-clamp-3";

  useEffect(() => {
    const el = ref.current;
    if (!el || open) {
      setOverflows(false);
      return;
    }

    const measure = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open, clampLines]);

  const showToggle = open || overflows;

  return (
    <div>
      <p
        ref={ref}
        className={`text-xs leading-relaxed ${className || "text-slate-700"} ${
          open ? "whitespace-pre-wrap" : clampClass
        }`}
      >
        {text}
      </p>
      {showToggle && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {open ? "Ocultar" : "Ver más"}
        </button>
      )}
    </div>
  );
}
