import type { ParsedIssue, ValidacionView } from "./types";

import { EvidenceBadge } from "./EvidenceBadge";

import { ComparativeValues } from "./ComparativeValues";

import { IssueMetaBlock } from "./IssueMetaBlock";

import { ExpandableText } from "./ExpandableText";

import { enrichIssue } from "./parse-issue";



interface IssueCardProps {

  validacion: ValidacionView;

  variant: "critical" | "warning";

}



function EvidenceSection({

  evidencia,

  tone,

}: {

  evidencia: ValidacionView["evidencia"];

  tone: "critical" | "warning";

}) {

  if (evidencia.length === 0) return null;



  const labelClass =

    tone === "critical"

      ? "text-red-700/70"

      : "text-amber-700/80";



  return (

    <div className="mt-5 border-t border-current/10 pt-4">

      <p className={`mb-3 text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>

        Evidencia

      </p>

      <div className="space-y-2">

        {evidencia.map((ev, i) => (

          <EvidenceBadge key={i} evidence={ev} />

        ))}

      </div>

    </div>

  );

}



export function IssueCard({ validacion, variant }: IssueCardProps) {

  const issue: ParsedIssue = enrichIssue(validacion);

  const title = validacion.title ?? validacion.ruleId;

  const hasComparison = !!(issue.excelValue || issue.memoryValue);



  if (variant === "critical") {

    return (

      <article className="rounded-xl border border-red-100 border-l-4 border-l-red-500 bg-red-50/60 p-6">

        <h3 className="text-base font-semibold leading-snug text-red-950">{title}</h3>



        {hasComparison ? (

          <ComparativeValues

            excelValue={issue.excelValue}

            memoryValue={issue.memoryValue}

            tone="critical"

          />

        ) : (

          issue.what && (

            <div className="mt-3">

              <ExpandableText text={issue.what} className="text-red-900/90" />

            </div>

          )

        )}



        {issue.diagnosis && (

          <IssueMetaBlock kind="diagnosis" tone="critical">

            {issue.diagnosis}

          </IssueMetaBlock>

        )}



        {issue.impact && (

          <IssueMetaBlock kind="impact" tone="critical">

            {issue.impact}

          </IssueMetaBlock>

        )}



        {issue.action && (

          <IssueMetaBlock kind="action" tone="critical">

            {issue.action}

          </IssueMetaBlock>

        )}



        <EvidenceSection evidencia={validacion.evidencia} tone="critical" />

      </article>

    );

  }



  return (

    <article className="rounded-xl border border-amber-100 border-l-4 border-l-amber-400 bg-amber-50/50 p-4">

      <h3 className="text-sm font-semibold leading-snug text-amber-950">{title}</h3>



      {hasComparison ? (

        <ComparativeValues

          excelValue={issue.excelValue}

          memoryValue={issue.memoryValue}

          tone="warning"

        />

      ) : (

        (issue.keyFact || issue.what) && (

          <p className="mt-2 text-sm font-medium text-amber-900">

            {issue.keyFact ?? issue.what.split(".")[0]}

          </p>

        )

      )}



      {validacion.tags?.includes("riesgo_fiscal") && (

        <span className="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">

          Riesgo fiscal

        </span>

      )}



      {issue.diagnosis && (

        <IssueMetaBlock kind="diagnosis" tone="warning">

          {issue.diagnosis}

        </IssueMetaBlock>

      )}



      {issue.impact && (

        <IssueMetaBlock kind="impact" tone="warning">

          {issue.impact}

        </IssueMetaBlock>

      )}



      {issue.action && (

        <IssueMetaBlock kind="action" tone="warning" clamp>

          {issue.action}

        </IssueMetaBlock>

      )}



      {validacion.evidencia.length > 0 && (

        <div className="mt-3 space-y-2">

          {validacion.evidencia.map((ev, i) => (

            <EvidenceBadge key={i} evidence={ev} compact={validacion.evidencia.length > 2} />

          ))}

        </div>

      )}

    </article>

  );

}

