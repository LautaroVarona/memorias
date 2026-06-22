interface HighlightTextProps {
  text: string;
  query?: string;
  className?: string;
}

/** Resalta la primera coincidencia de `query` dentro de `text`. */
export function HighlightText({ text, query, className }: HighlightTextProps) {
  if (!query || query.trim().length < 3) {
    return <span className={className}>{text}</span>;
  }

  const normalized = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  const index = normalized.indexOf(needle);

  if (index === -1) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-amber-200 px-0.5 text-inherit">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </span>
  );
}
