import { invoke } from "@tauri-apps/api/core"

import type {
  LatexAnalysisRequest,
  LatexProjectAnalysis,
  LatexSymbolInfo,
  LatexSymbolRequest,
} from "@/domain/latex-analysis"
import {
  parseLatexProjectAnalysis,
  parseLatexSymbolInfo,
} from "@/domain/latex-analysis"

/** Diagnoses the active buffer against every source file in the project. */
export async function requestLatexProjectAnalysis(
  request: LatexAnalysisRequest
): Promise<LatexProjectAnalysis> {
  return parseLatexProjectAnalysis(
    await invoke<unknown>("latex_project_diagnostics", { request })
  )
}

/**
 * Resolves the symbol under a cursor position to its definitions and uses
 * across the project; `null` when the cursor is not on a resolvable symbol.
 */
export async function requestLatexSymbol(
  request: LatexSymbolRequest
): Promise<LatexSymbolInfo | null> {
  return parseLatexSymbolInfo(
    await invoke<unknown>("latex_symbol_at", { request })
  )
}
