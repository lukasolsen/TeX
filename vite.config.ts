import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const latexWorkspaceSuffixes = [
  ".acn",
  ".acr",
  ".alg",
  ".aux",
  ".bbl",
  ".bcf",
  ".bib",
  ".blg",
  ".cls",
  ".dvi",
  ".fdb_latexmk",
  ".fls",
  ".glo",
  ".gls",
  ".glg",
  ".idx",
  ".ilg",
  ".ind",
  ".ist",
  ".lof",
  ".log",
  ".lot",
  ".nav",
  ".out",
  ".pdf",
  ".ps",
  ".run.xml",
  ".snm",
  ".sty",
  ".synctex",
  ".synctex(busy)",
  ".synctex.gz",
  ".synctex.gz(busy)",
  ".tex",
  ".toc",
  ".txt",
  ".vrb",
  ".xdv",
]

export function isLatexWorkspaceFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase()
  return latexWorkspaceSuffixes.some((suffix) => normalized.endsWith(suffix))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    // A project can live within this repository during development. Saving a
    // LaTeX source must not make Vite reload the application and restart its
    // workspace-restoration flow.
    watch: {
      ignored: isLatexWorkspaceFile,
    },
  },
})
