import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Der Prototyp ist die Spezifikation in ausführbarer Form,
    // kein Anwendungscode. Er wird nicht geprüft und nicht gebaut.
    "docs/**",
  ]),
]);

export default eslintConfig;
