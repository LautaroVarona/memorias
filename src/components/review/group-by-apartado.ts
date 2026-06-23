import type { ApartadoMemoria } from "@/types/domain";
import type { ValidacionView } from "./types";
import { apartadoSlug } from "@/lib/rules/helpers/text-normalize";
import {
  extractApartadoFromEvidence,
  extractApartadoInfo,
  filterConflictingPasses,
  isCritical,
  isExpedienteLevelOnly,
  isInterannualStatOnly,
  isPass,
  isWarning,
  normalizeEvidenceType,
} from "./parse-issue";

export type ApartadoStatus = "critical" | "warning" | "ok";
export type SeverityFilter = "all" | ApartadoStatus;

export interface ApartadoReviewGroup {
  num: string;
  title?: string;
  contenido?: string;
  contenidoAnterior?: string;
  status: ApartadoStatus;
  validations: ValidacionView[];
  counts: { critical: number; warning: number; pass: number };
}

const GENERAL_NUM = "general";

function apartadoNumFromSection(sec: ApartadoMemoria): string {
  return sec.numero !== undefined ? String(sec.numero).padStart(2, "0") : sec.id;
}

function validationApartados(v: ValidacionView): string[] {
  const nums = new Set<string>();

  for (const ev of v.evidencia) {
    if (normalizeEvidenceType(ev) !== "memory") continue;
    const info = extractApartadoFromEvidence(ev);
    if (info) nums.add(info.num);
  }

  if (nums.size === 0) {
    const fallback = extractApartadoInfo(v);
    if (fallback) nums.add(fallback.num);
  }

  if (nums.size === 0) nums.add(GENERAL_NUM);
  return [...nums];
}

function worstStatus(counts: { critical: number; warning: number }): ApartadoStatus {
  if (counts.critical > 0) return "critical";
  if (counts.warning > 0) return "warning";
  return "ok";
}

function compareApartadoNum(a: string, b: string): number {
  if (a === GENERAL_NUM) return 1;
  if (b === GENERAL_NUM) return -1;
  const na = parseInt(a.replace(/\D/g, ""), 10);
  const nb = parseInt(b.replace(/\D/g, ""), 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "es");
}

function findPriorSection(
  current: ApartadoMemoria,
  priorSections: ApartadoMemoria[]
): ApartadoMemoria | undefined {
  const slug = apartadoSlug(current);
  return priorSections.find((s) => apartadoSlug(s) === slug);
}

export function buildApartadoGroups(
  sections: ApartadoMemoria[],
  validaciones: ValidacionView[],
  priorSections: ApartadoMemoria[] = []
): ApartadoReviewGroup[] {
  const filtered = filterConflictingPasses(validaciones).filter(
    (v) => !isInterannualStatOnly(v.ruleId) && !isExpedienteLevelOnly(v.ruleId)
  );

  const map = new Map<string, ApartadoReviewGroup>();

  for (const sec of sections) {
    const num = apartadoNumFromSection(sec);
    const prior = findPriorSection(sec, priorSections);
    map.set(num, {
      num,
      title: sec.titulo,
      contenido: sec.contenido,
      contenidoAnterior: prior?.contenido,
      status: "ok",
      validations: [],
      counts: { critical: 0, warning: 0, pass: 0 },
    });
  }

  for (const v of filtered) {
    const targets = validationApartados(v);
    for (const num of targets) {
      let group = map.get(num);
      if (!group) {
        const info = extractApartadoInfo(v);
        group = {
          num,
          title: info?.num === num ? info.title : undefined,
          contenido: undefined,
          status: "ok",
          validations: [],
          counts: { critical: 0, warning: 0, pass: 0 },
        };
        map.set(num, group);
      }

      if (group.validations.some((existing) => existing.id === v.id)) continue;
      group.validations.push(v);

      if (isCritical(v)) group.counts.critical += 1;
      else if (isWarning(v)) group.counts.warning += 1;
      else if (isPass(v)) group.counts.pass += 1;
    }
  }

  const groups = [...map.values()];
  for (const group of groups) {
    group.status = worstStatus(group.counts);
  }

  return groups.sort((a, b) => compareApartadoNum(a.num, b.num));
}

export function filterApartadoGroups(
  groups: ApartadoReviewGroup[],
  filter: SeverityFilter
): ApartadoReviewGroup[] {
  if (filter === "all") return groups;
  return groups.filter((g) => g.status === filter);
}

export function countApartadoStatuses(groups: ApartadoReviewGroup[]): Record<ApartadoStatus, number> {
  return groups.reduce(
    (acc, g) => {
      acc[g.status] += 1;
      return acc;
    },
    { critical: 0, warning: 0, ok: 0 }
  );
}

export function formatApartadoHeading(group: ApartadoReviewGroup): string {
  if (group.num === GENERAL_NUM) return "Revisión general";
  const prefix = /^\d+$/.test(group.num) ? `${group.num}. ` : "";
  return `${prefix}${group.title ?? `Apartado ${group.num}`}`;
}
