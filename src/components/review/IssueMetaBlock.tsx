interface IssueMetaBlockProps {
  kind: "impact" | "action" | "diagnosis";
  children: string;
  tone?: "critical" | "warning";
  clamp?: boolean;
}

function Icon({ kind }: { kind: IssueMetaBlockProps["kind"] }) {
  if (kind === "impact") {
    return (
      <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (kind === "action") {
    return (
      <svg className="h-4 w-4 shrink-0 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const LABELS: Record<IssueMetaBlockProps["kind"], string> = {
  impact: "Impacto",
  action: "Acción",
  diagnosis: "Diagnóstico",
};

export function IssueMetaBlock({
  kind,
  children,
  tone = "critical",
  clamp = false,
}: IssueMetaBlockProps) {
  const textTone =
    tone === "critical" ? "text-slate-600" : "text-slate-600";

  return (
    <div className="mt-4 flex gap-2.5">
      <Icon kind={kind} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {LABELS[kind]}
        </p>
        <p
          className={`mt-0.5 text-sm leading-relaxed ${textTone} ${
            clamp ? "line-clamp-2" : ""
          } ${kind === "action" ? "font-medium text-slate-700" : ""}`}
        >
          {children}
        </p>
      </div>
    </div>
  );
}
