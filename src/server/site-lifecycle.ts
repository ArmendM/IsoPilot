/* Das Statusmodell einer Baustelle aus docs/lifecycle.md, Stufe M6b.
 *
 * Absichtlich noch nicht aufgerufen: SiteStatus in prisma/schema.prisma
 * kennt erst OPEN, PAUSED und DONE. Kein toter Code, siehe CLAUDE.md,
 * Abschnitt "Kein toter Code: das Statusmodell in site-lifecycle.ts".
 *
 * Diese Datei importiert bewusst nichts. Sie ist reine Rechenlogik und
 * lässt sich deshalb ohne Datenbank testen, siehe tests/einheit. */

/** Der gerade Weg einer Baustelle, von der Anfrage bis bezahlt. */
const LINIE = [
  "OFFERTE",
  "AUFTRAG",
  "GEPLANT",
  "IN_ARBEIT",
  "AUSGEFUEHRT",
  "VERRECHNET",
  "ABGESCHLOSSEN",
] as const;

/** Nebenzustände neben dem geraden Weg. */
const NEBEN = ["PAUSIERT", "VERLOREN", "STORNIERT"] as const;

export type SiteLifecycleStatus = (typeof LINIE)[number] | (typeof NEBEN)[number];

/** Status, die nichts mehr annehmen: nur noch lesen. Aus `VERLOREN` führt
 *  als einzige Ausnahme der dokumentierte Weg zurück auf `OFFERTE`, eine
 *  verlorene Anfrage darf wieder aufleben. Pausieren lässt sich keiner
 *  von ihnen. */
const RUHEND: readonly SiteLifecycleStatus[] = ["ABGESCHLOSSEN", "VERLOREN", "STORNIERT"];

/** Der gerade Weg und die dokumentierten Rückschritte, ohne die
 *  Nebenzustände. Nicht die ganze Wahrheit, siehe `NEXT_STATUS`. */
const WEG: Record<SiteLifecycleStatus, SiteLifecycleStatus[]> = {
  OFFERTE: ["AUFTRAG", "VERLOREN"],
  AUFTRAG: ["GEPLANT"],
  GEPLANT: ["IN_ARBEIT", "AUFTRAG"],
  IN_ARBEIT: ["AUSGEFUEHRT", "GEPLANT"],
  AUSGEFUEHRT: ["VERRECHNET", "IN_ARBEIT"],
  VERRECHNET: ["ABGESCHLOSSEN", "AUSGEFUEHRT"],
  ABGESCHLOSSEN: [],
  VERLOREN: ["OFFERTE"],
  PAUSIERT: [],
  STORNIERT: [],
};

const laeuft = (s: SiteLifecycleStatus) => s !== "PAUSIERT" && !RUHEND.includes(s);

/** Erlaubte Statuswechsel einer Baustelle. Kein freies Springen.
 *
 *  `PAUSIERT` und `STORNIERT` sind aus jedem laufenden Status erreichbar,
 *  und aus `PAUSIERT` führt der Weg in genau die Status zurück, aus denen
 *  pausiert werden konnte. Beide Richtungen stehen deshalb nicht von Hand
 *  in der Tabelle, sondern werden hier einmal abgeleitet: sonst kann eine
 *  pausierte Offerte stecken bleiben, weil jemand nur die Hinrichtung
 *  nachgeführt hat. */
export const NEXT_STATUS: Record<SiteLifecycleStatus, SiteLifecycleStatus[]> =
  Object.fromEntries(
    [...LINIE, ...NEBEN].map((s) => [
      s,
      s === "PAUSIERT"
        ? [...[...LINIE, ...NEBEN].filter(laeuft), "STORNIERT"]
        : laeuft(s)
          ? [...WEG[s], "PAUSIERT", "STORNIERT"]
          : WEG[s],
    ]),
  ) as Record<SiteLifecycleStatus, SiteLifecycleStatus[]>;

/** Rückschritte und Abbrüche verlangen eine Begründung. */
export function needsReason(from: SiteLifecycleStatus, to: SiteLifecycleStatus): boolean {
  if (["VERLOREN", "STORNIERT", "PAUSIERT"].includes(to)) return true;
  const a = (LINIE as readonly string[]).indexOf(from);
  const b = (LINIE as readonly string[]).indexOf(to);
  return a >= 0 && b >= 0 && b < a;
}

export function assertTransition(
  from: SiteLifecycleStatus,
  to: SiteLifecycleStatus,
  reason?: string,
) {
  if (!(NEXT_STATUS[from] ?? []).includes(to)) throw new Error("BAD_TRANSITION");
  if (needsReason(from, to) && !reason?.trim()) throw new Error("REASON_REQUIRED");
}

/** Zeit buchen ab Auftrag, Material bereits in der Offertphase.
 *  Pausiert und abgeschlossen nimmt nichts mehr an. */
export const canBookTime = (s: SiteLifecycleStatus) =>
  (["AUFTRAG", "GEPLANT", "IN_ARBEIT"] as SiteLifecycleStatus[]).includes(s);
export const canBookMaterial = (s: SiteLifecycleStatus) =>
  (["OFFERTE", "AUFTRAG", "GEPLANT", "IN_ARBEIT", "AUSGEFUEHRT"] as SiteLifecycleStatus[]).includes(s);
