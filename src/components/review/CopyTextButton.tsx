"use client";

import { useState } from "react";

interface CopyTextButtonProps {
  text: string;
  label?: string;
  variant?: "default" | "icon";
  className?: string;
}

function CopyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
    </svg>
  );
}

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CopyTextButton({
  text,
  label = "Copiar",
  variant = "default",
  className = "",
}: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);

  if (!text.trim()) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible */
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        title={copied ? "Copiado" : "Copiar evidencia"}
        aria-label={copied ? "Copiado" : "Copiar evidencia"}
        className={`inline-flex shrink-0 items-center justify-center rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 ${copied ? "text-emerald-600" : ""} ${className}`}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 ${className}`}
    >
      {copied ? (
        <>
          <CheckIcon className="text-emerald-600" />
          Copiado
        </>
      ) : (
        <>
          <CopyIcon />
          {label}
        </>
      )}
    </button>
  );
}
