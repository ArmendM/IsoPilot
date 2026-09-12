import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("sid")?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete("sid");
  // 303, nicht 307: nach einem POST muss der Browser mit GET weitergehen,
  // sonst schickt er das POST an /login erneut.
  return NextResponse.redirect(new URL("/login", process.env.APP_URL), 303);
}
