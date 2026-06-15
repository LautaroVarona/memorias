import type { EvidenceItem } from "./types";
import { EvidenceBadge } from "./EvidenceBadge";

interface EvidenceChipProps {
  evidence: EvidenceItem;
}

/** @deprecated Usar EvidenceBadge — se mantiene por compatibilidad */
export function EvidenceChip({ evidence }: EvidenceChipProps) {
  return <EvidenceBadge evidence={evidence} compact />;
}
