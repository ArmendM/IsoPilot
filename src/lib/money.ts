import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal;
export const money = (v: number | string): Money => new Prisma.Decimal(v);

export const chf = (v: number | Money): string =>
  `Fr. ${Number(v).toFixed(2).replace(".", ",")}`;

export const VAT_RATE = 8.1;

/** Kleinmengenzuschlag, kumuliert je Baustelle und Artikel gerechnet. */
export function smallQtySurcharge(
  totalQty: number,
  threshold: number | null,
  surcharge: number | null,
): number {
  if (!threshold || !surcharge) return 0;
  return totalQty > 0 && totalQty < threshold ? surcharge : 0;
}

/** Prüfziffer nach Modulo 10 rekursiv, für die QR-Referenz. */
const T = [
  [0, 9, 4, 6, 8, 2, 7, 1, 3, 5], [9, 4, 6, 8, 2, 7, 1, 3, 5, 0],
  [4, 6, 8, 2, 7, 1, 3, 5, 0, 9], [6, 8, 2, 7, 1, 3, 5, 0, 9, 4],
  [8, 2, 7, 1, 3, 5, 0, 9, 4, 6], [2, 7, 1, 3, 5, 0, 9, 4, 6, 8],
  [7, 1, 3, 5, 0, 9, 4, 6, 8, 2], [1, 3, 5, 0, 9, 4, 6, 8, 2, 7],
  [3, 5, 0, 9, 4, 6, 8, 2, 7, 1], [5, 0, 9, 4, 6, 8, 2, 7, 1, 3],
];

export function qrReference(seed: string): string {
  const base = seed.replace(/\D/g, "").padStart(26, "0").slice(-26);
  let c = 0;
  for (const ch of base) c = T[c][Number(ch)];
  return base + ((10 - c) % 10);
}
