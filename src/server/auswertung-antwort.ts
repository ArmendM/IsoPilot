// Aus einem Bericht eine Datei zum Herunterladen machen.
import type { SessionUser } from "@/lib/session";
import type { Bericht } from "@/server/auswertung-blaetter";
import { dateiname, mappe } from "@/server/excel";
import { pdf } from "@/server/pdf";
import { firmenkopf } from "@/server/firma-read";

function antwort(bytes: Buffer, typ: string, name: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": typ,
      "content-disposition": `attachment; filename="${name}"`,
      // Eine Auswertung ist eine Momentaufnahme und gehört in keinen Zwischenspeicher.
      "cache-control": "no-store",
    },
  });
}

export async function alsExcel(bericht: Bericht, teile: (string | null)[]) {
  return antwort(
    await mappe(bericht.blaetter),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `${dateiname(teile)}.xlsx`,
  );
}

export async function alsPdf(
  bericht: Bericht,
  teile: (string | null)[],
  user: SessionUser,
) {
  return antwort(
    await pdf(bericht, await firmenkopf(user)),
    "application/pdf",
    `${dateiname(teile)}.pdf`,
  );
}
