// Static, backend-free build of the frontend for GitHub Pages.
// Builds frontend/ exactly as it is and adds demo/backend-shim.ts in front of it.
//   cd frontend && yarn vite build --config ../demo/vite.config.js
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SHIM_ID = "/@demo/backend-shim.ts";

/** @returns {import("vite").Plugin} */
function demoBackend() {
  return {
    name: "demo-backend",
    resolveId(id) {
      if (id === SHIM_ID) return here("./backend-shim.ts");
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html.replace(
          '<script type="module" src="/src/main.ts"></script>',
          `<script type="module" src="${SHIM_ID}"></script>\n    <script type="module" src="/src/main.ts"></script>`,
        ),
    },
    // The frontend navigates to "/" and "/menu" (site root). On GitHub Pages the
    // app lives under /<repo>/, so point those at the build's base URL instead.
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/frontend/src/main.ts")) return;
      return code
        .replace(/(history\.replaceState\(\{ page: "menu" \}, "", )"\/"\)/g, "$1import.meta.env.BASE_URL)")
        .replace('location.replace("/menu")', "location.replace(import.meta.env.BASE_URL)");
    },
  };
}

export default defineConfig({
  root: here("../frontend"),
  base: process.env.DEMO_BASE ?? "/ft_trascendence/",
  publicDir: here("./public"),
  plugins: [tailwindcss(), demoBackend()],
  resolve: {
    alias: {
      "@samir/shared/constants": here("../shared/constants.ts"),
      "@samir/shared/schemas": here("../shared/schemas.ts"),
    },
  },
  worker: { format: "es" },
  build: {
    outDir: here("./dist"),
    emptyOutDir: true,
  },
  server: { fs: { allow: [here("..")] } },
});
