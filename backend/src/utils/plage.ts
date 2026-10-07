// Plage de dates passée en query (?dateFrom=…&dateTo=…, instants ISO calculés
// dans le fuseau du téléphone). Une borne absente ou invalide est ignorée.
export function plageDates(query: Record<string, unknown>): { gte?: Date; lte?: Date } | undefined {
  const lire = (v: unknown) => {
    if (typeof v !== "string" || !v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const gte = lire(query.dateFrom);
  const lte = lire(query.dateTo);
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined;
}
