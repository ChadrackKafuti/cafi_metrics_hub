import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { AREA_INDICATORS } from "../lib/model";
import { outcomeVar } from "../lib/colors";
import { DataTable, type Column } from "../components/ui";
import type { Indicator } from "../lib/types";

export function Methodology() {
  const { m, lang } = useApp();
  const fr = lang === "fr";
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Built from")} {m.meta.source} · {m.meta.recordCount} {t("rows")}</div>
          <h1>{t("Methodology")}</h1>
        </div>
      </div>
      <div className="grid g-2">
        <section className="card">
          <h3>{fr ? "Comment lire les chiffres" : "How to read the numbers"}</h3>
          <ul className="small ink-2" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {fr ? (
              <>
                <li>Les résultats sont <b>cumulés</b> : la valeur d'une année est le total atteint depuis le début du programme. Les années ne s'additionnent jamais.</li>
                <li>Si une année n'est pas encore déclarée, la dernière valeur déclarée est reprise.</li>
                <li><b>Taux d'atteinte</b> = Σ résultats / Σ cibles, sur les lignes qui ont une cible. Le taux d'un résultat est la moyenne de ses indicateurs.</li>
                <li>Les valeurs d'unités différentes (ha, nombre, km) ne sont jamais additionnées.</li>
                <li>« Hectares plantés, restaurés ou protégés » regroupe les indicateurs {AREA_INDICATORS.join(", ")} ; la superficie couverte par des plans (08) est exclue car elle recoupe les autres.</li>
                <li><b>Statut</b> : le taux d'atteinte est comparé à la part de la période du programme déjà écoulée (≥ 90 % de l'attendu : en bonne voie ; ≥ 50 % : en retard ; sinon hors trajectoire).</li>
              </>
            ) : (
              <>
                <li>Results are <b>cumulative</b>: a year's value is the total reached since the programme started. Years are never added together.</li>
                <li>When a year has not been reported yet, the latest reported value is carried forward.</li>
                <li><b>Achievement</b> = Σ results / Σ targets, over rows that have a target. An outcome's achievement is the average of its indicators.</li>
                <li>Values in different units (ha, count, km) are never added together.</li>
                <li>"Hectares planted, restored or protected" covers indicators {AREA_INDICATORS.join(", ")}; land covered by land-use plans (08) is left out because it overlaps the others.</li>
                <li><b>Status</b> compares achievement with the share of the programme period that has elapsed (≥ 90 % of expected: on track; ≥ 50 %: behind; otherwise off track).</li>
              </>
            )}
          </ul>
        </section>
        <section className="card">
          <h3>{fr ? "Carbone" : "Carbon"}</h3>
          <ul className="small ink-2" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {fr ? (
              <>
                <li><b>Engagées (cycle complet)</b> = résultat cumulé × facteur annuel × horizon (10 ou 15 ans).</li>
                <li><b>Réalisées à date</b> = chaque année, la superficie (ou les foyers) en place produit une année de bénéfice.</li>
                <li><b>Cible</b> = cible finale × facteur × même horizon que les résultats.</li>
                <li>Les facteurs sont dans <code>config/co2_factors.yml</code> et visibles sur la page Impact climatique.</li>
              </>
            ) : (
              <>
                <li><b>Committed (full cycle)</b> = cumulative result × annual factor × horizon (10 or 15 years).</li>
                <li><b>Realised to date</b> = each year, the area (or stoves) in place delivers one year of benefit.</li>
                <li><b>Target</b> = final target × factor × the same horizon as results.</li>
                <li>Factors live in <code>config/co2_factors.yml</code> and are listed on the Climate impact page.</li>
              </>
            )}
          </ul>
        </section>
      </div>
      <section className="section">
        <div className="section-head"><h2>{t("Indicators")}</h2><span className="muted small">config/indicators.yml</span></div>
        <DataTable rows={m.indicators} cols={[
          { key: "c", label: "#", value: (i) => i.code },
          { key: "n", label: t("Indicator"), value: (i) => nameOf(i) },
          { key: "o", label: t("Outcomes"), value: (i) => nameOf(m.outcomes.find((o) => o.id === i.outcome)!),
            render: (i) => <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i className="dot" style={{ background: outcomeVar(m, i.outcome) }} />{nameOf(m.outcomes.find((o) => o.id === i.outcome)!)}</span> },
          { key: "u", label: "Unit", value: (i) => i.unit },
          { key: "co2", label: "CO₂", value: (i) => (i.hasCo2 ? "✓" : "") },
        ] as Column<Indicator>[]} />
      </section>
    </>
  );
}
