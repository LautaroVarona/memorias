type SeverityLevel = "critical" | "warning" | "ok";

const CONFIG: Record<
  SeverityLevel,
  { label: string; className: string }
> = {
  critical: {
    label: "Crítico",
    className: "bg-red-600 text-white",
  },
  warning: {
    label: "Advertencia",
    className: "bg-yellow-400 text-black",
  },
  ok: {
    label: "OK",
    className: "bg-green-600 text-white",
  },
};

export function SeverityBadge({ level }: { level: SeverityLevel }) {
  const { label, className } = CONFIG[level];
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

export function severityBorderClass(level: SeverityLevel): string {
  if (level === "critical") return "border-l-red-600";
  if (level === "warning") return "border-l-amber-400";
  return "border-l-green-600";
}
