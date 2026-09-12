import nodemailer from "nodemailer";
import { db } from "@/lib/db";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! }
    : undefined,
  pool: true,
  maxConnections: 2,
  rateDelta: 60_000,
  rateLimit: 20,
});

type Attachment = { filename: string; content: Buffer; contentType?: string };

export async function sendMail(opts: {
  companyId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
  kind?: string;
  refId?: string;
}) {
  // Erst protokollieren, dann senden. Bricht der Prozess ab, weisst du
  // wenigstens, dass es einen Versuch gab.
  const log = await db.emailLog.create({
    data: {
      companyId: opts.companyId,
      to: opts.to,
      subject: opts.subject,
      kind: opts.kind ?? "system",
      refId: opts.refId,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      replyTo: process.env.MAIL_REPLY_TO,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    await db.emailLog.update({
      where: { id: log.id },
      data: { status: "SENT", messageId: info.messageId, sentAt: new Date(), attempts: 1 },
    });
    return { ok: true as const, id: log.id };
  } catch (e) {
    await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message.slice(0, 500) : "unbekannt",
        attempts: { increment: 1 },
      },
    });
    // Nicht werfen: eine Offerte darf nicht verloren gehen, nur weil der
    // Mailserver kurz nicht erreichbar war.
    return { ok: false as const, id: log.id };
  }
}
