import type { Metadata } from "next";
import { Archivo, Barlow } from "next/font/google";
import "./globals.css";

/* Die Schriften aus dem Markenhandbuch. next/font nimmt sie beim Bauen
 * mit, die Oberfläche fragt also kein fremdes Netz: das ist schneller
 * und hält die Adressen der Mitarbeitenden aus fremden Zugriffsprotokollen
 * heraus.
 *
 * Nur die Gewichte, die das Handbuch nennt. Jedes weitere wäre eine
 * Datei, die auf der Baustelle mitgeladen wird, ohne dass sie jemand
 * sieht. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["800"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "IsoPilot",
  description: "Stunden, Material, Ausmass. Alles auf einer Baustelle.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de-CH"
      className={`${archivo.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
