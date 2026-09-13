import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncHolidays } from "@/lib/holidays";
import { rolloverVacation } from "@/server/vacation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { job } = await params;

  switch (job) {
    case "holidays":
      return NextResponse.json(await syncHolidays());
    case "vacation":
      return NextResponse.json(await rolloverVacation());
    case "retention":
      return NextResponse.json(await applyRetention());
    case "sessions":
      return NextResponse.json(
        await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      );
    default:
      return new NextResponse("unknown job", { status: 404 });
  }
}

/** 10 Jahre für Zeitdaten, 18 Monate für Krankheitsnotizen. */
async function applyRetention() {
  const today = new Date();
  const [entries, notes] = await db.$transaction([
    db.timeEntry.deleteMany({ where: { deleteAfter: { lt: today } } }),
    db.absence.updateMany({
      where: { type: "SICK", noteClearAt: { lt: today }, note: { not: null } },
      data: { note: null, noteClearAt: null },
    }),
  ]);
  return { deletedEntries: entries.count, clearedNotes: notes.count };
}
