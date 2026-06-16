function toSupabaseInList(values) {
  if (!Array.isArray(values)) return "()";
  const encoded = values
    .map(v => {
      const s = String(v || "").trim();
      if (!s) return null;
      // Double quote for PostgREST, then URI encode for the browser/fetch
      return `"${encodeURIComponent(s)}"`;
    })
    .filter(Boolean)
    .join(",");
  return `(${encoded})`;
}
