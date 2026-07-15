import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

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
      ignored: [
        "**/*.{aux,bib,cls,fdb_latexmk,fls,pdf,sty,synctex.gz,tex,txt}",
      ],
    },
  },
})
