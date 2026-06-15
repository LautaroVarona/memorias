"use client";

import { useState } from "react";
import { extractSearchSnippet } from "./evidence-utils";

interface CopyLocatorButtonProps {
  text: string;
}

export function CopyLocatorButton({ text }: CopyLocatorButtonProps) {
  const [copied, setCopied] = useState(false);
  const snippet = extractSearchSnippet(text);

  if (!snippet) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title="Copiar texto para buscar en Word (Ctrl+F)"
      aria-label="Copiar texto para buscar en Word (Ctrl+F)"
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-blue-200 bg-white p-1 text-blue-600 transition hover:bg-blue-50 hover:text-blue-800"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
        </svg>
      )}
    </button>
  );
}
