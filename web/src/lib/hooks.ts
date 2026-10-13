import { useMemo } from "react";
import { applyFilters, yearIndex } from "./model";
import { useApp } from "./state";

/** Records after the global country / partner / programme filters, plus the selected year index. */
export function useFiltered() {
  const { m, ix, filters } = useApp();
  const records = useMemo(
    () => applyFilters(ix, filters),
    [ix, filters.countries, filters.partners, filters.programmes], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { records, yi: yearIndex(m, filters.year), year: filters.year, years: m.meta.years };
}
