import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erzeugt ein schlankes Image für den Container
  output: "standalone",
  poweredByHeader: false,
  /* pdfkit liest seine Schriftmetriken zur Laufzeit als Dateien aus dem
   * eigenen Paket. Gebündelt findet es sie nicht mehr, deshalb wird es
   * vom Bündeln ausgenommen und wie gewohnt über require geladen. Auf
   * der Liste, die Next von sich aus ausnimmt, steht es nicht. */
  serverExternalPackages: ["pdfkit"],
  // Hinweis: experimental.trustHostHeader gibt es seit Next 16 nicht mehr.
  // nginx setzt X-Forwarded-Proto und X-Forwarded-Host, Next wertet diese
  // hinter einem Proxy von sich aus aus.
  experimental: {
    serverActions: {
      // Der Excel-Import schickt die Datei an eine Server Action, und zwar
      // zweimal: einmal für die Vorschau, einmal fürs Ausführen. Die
      // Vorgabe von 1 MB reicht für eine Materialliste, aber eine aus
      // einem Warenwirtschaftssystem exportierte Mappe mit Formatierung
      // liegt schnell darüber, und die Fehlermeldung wäre nichtssagend.
      // multipart/form-data legt noch Rahmen und Kopfzeilen obendrauf.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
