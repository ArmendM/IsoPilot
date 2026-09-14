import { IsoTeamWortmarke } from "@/components/marke/isoteam-logo";

/* Die Zeile zuoberst auf jeder Unterseite: links die Wege zurück, rechts
 * die Wortmarke.
 *
 * Rechts, weil dort auf allen Unterseiten Platz frei ist und links die
 * Links stehen, die tatsächlich angeklickt werden. Eine eigene
 * Komponente, weil zehn Seiten dieselbe Zeile tragen: zehnmal von Hand
 * heisst, dass die elfte sie vergisst und die zwölfte sie anders setzt.
 *
 * Klein gehalten, 20 Pixel Höhe ergeben 132 Pixel Breite und liegen
 * damit über der Mindestbreite von 90 aus dem Markenhandbuch. */
export function Kopfleiste({ children }: { children: React.ReactNode }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {children}
      <IsoTeamWortmarke hoehe={20} className="ml-auto shrink-0" />
    </nav>
  );
}
