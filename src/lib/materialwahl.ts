/* Reine Auswahl-Logik für die Materialbuchung, ohne React und ohne
 * Prisma. Liegt hier, damit sie sich in tests/einheit prüfen lässt. */

export type WaehlbarerArtikel = {
  kategorieId: string | null;
  kategorie: string | null;
};

/** Artikel ohne Kategorie bekommen einen eigenen Topf, sonst wären sie
 *  über die Kategoriewahl nicht mehr erreichbar. `categoryId` ist im
 *  Schema optional. */
export const OHNE_KATEGORIE = "ohne-kategorie";
export const ALLE_KATEGORIEN = "alle";

export const kategorieVon = (a: WaehlbarerArtikel) => a.kategorieId ?? OHNE_KATEGORIE;

/** Nur Kategorien, in denen es auch Artikel gibt, in der Reihenfolge, in
 *  der die Artikel kommen. Eine leere Kategorie zur Auswahl anzubieten
 *  führt nur zu einer leeren Artikelliste. */
export function kategorienAus(artikel: WaehlbarerArtikel[]): { id: string; name: string }[] {
  const gesehen = new Map<string, string>();
  for (const a of artikel) {
    const id = kategorieVon(a);
    if (!gesehen.has(id)) gesehen.set(id, a.kategorie ?? "Ohne Kategorie");
  }
  return [...gesehen].map(([id, name]) => ({ id, name }));
}

export function nachKategorie<T extends WaehlbarerArtikel>(artikel: T[], kategorieId: string): T[] {
  if (kategorieId === ALLE_KATEGORIEN) return artikel;
  return artikel.filter((a) => kategorieVon(a) === kategorieId);
}
