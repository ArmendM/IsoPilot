import { NextResponse } from "next/server";
import { syncHolidays } from "@/lib/holidays";
import { rolloverVacation } from "@/server/vacation";
import { aufbewahrungAnwenden } from "@/server/aufbewahrung";

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
      return NextResponse.json(await aufbewahrungAnwenden());
    /* "sessions" war einmal ein eigener Job und ist jetzt Teil der
     * Aufbewahrung: alle Fristen an einer Stelle, sonst kennt jede
     * Stelle eine andere. Der Name bleibt, weil er in bereits
     * ausgerollten systemd-Units steht. Zweimal aufgerufen schadet
     * nichts, der Lauf ist wiederholbar. */
    case "sessions":
      return NextResponse.json(await aufbewahrungAnwenden());
    default:
      return new NextResponse("unknown job", { status: 404 });
  }
}
