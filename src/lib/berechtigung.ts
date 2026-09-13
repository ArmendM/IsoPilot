/* Berechtigungen, die nicht allein an der Rolle hängen.
 *
 * Ohne Prisma und ohne React, damit die Regel in tests/einheit ohne
 * Datenbank festgenagelt werden kann und überall dieselbe ist: eine
 * Prüfung, die an fünf Stellen von Hand ausgeschrieben wird, läuft
 * irgendwann an einer davon auseinander. */

export type Berechtigt = {
  role: "EMPLOYEE" | "ADMIN";
  canManageStock: boolean;
};

/**
 * Darf diese Person Wareneingänge erfassen und den Lagerverlauf sehen?
 *
 * Ein Vorgesetzter darf es immer, sonst müsste ihm das Merkmal einzeln
 * gesetzt werden und ein Vergessen sperrte ihn aus dem eigenen Lager aus.
 * Darüber hinaus jede Person, der es unter /personen zugewiesen wurde.
 */
export function darfLager(user: Berechtigt): boolean {
  return user.role === "ADMIN" || user.canManageStock;
}
