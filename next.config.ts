import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erzeugt ein schlankes Image für den Container
  output: "standalone",
  poweredByHeader: false,
  // Hinweis: experimental.trustHostHeader gibt es seit Next 16 nicht mehr.
  // nginx setzt X-Forwarded-Proto und X-Forwarded-Host, Next wertet diese
  // hinter einem Proxy von sich aus aus.
};

export default nextConfig;
