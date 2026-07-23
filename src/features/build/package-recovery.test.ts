// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BuildDiagnostic, PackageCandidate } from "@/domain/build"
import {
  missingPackageFile,
  usePackageRecovery,
} from "@/features/build/use-package-recovery"

const missingPackage: BuildDiagnostic = {
  code: "missingPackage",
  severity: "error",
  message: "The package algorithm2e isn't installed.",
  raw: "! LaTeX Error: File `algorithm2e.sty' not found.",
  context: null,
  file: null,
  line: null,
  mappingUncertain: true,
  occurrences: 1,
  logSequence: null,
}

const candidate: PackageCandidate = {
  file: "algorithm2e.sty",
  package: "algorithm2e",
  command: "tlmgr install algorithm2e",
}

let resolved: PackageCandidate | null = candidate
let installFails = false
const resolveMissingPackage = vi.fn<() => Promise<PackageCandidate | null>>(
  () => Promise.resolve(resolved)
)
const installLatexPackage = vi.fn<() => Promise<void>>(() =>
  installFails
    ? Promise.reject(
        Object.assign(new Error("tlmgr failed"), {
          code: "package-install-failed",
          message: "algorithm2e was not installed.",
        })
      )
    : Promise.resolve()
)

vi.mock("@/services/build-service", () => ({
  resolveMissingPackage: () => resolveMissingPackage(),
  installLatexPackage: () => installLatexPackage(),
}))

afterEach(() => {
  cleanup()
  resolved = candidate
  installFails = false
  resolveMissingPackage.mockClear()
  installLatexPackage.mockClear()
})

describe("missingPackageFile", () => {
  it("reads the file name out of the compiler's own line", () => {
    expect(missingPackageFile(missingPackage)).toBe("algorithm2e.sty")
  })

  /// Only a missing-package diagnostic offers the action; anything else has no
  /// package to install and must not pretend otherwise.
  it("offers nothing for a diagnostic of another kind", () => {
    expect(
      missingPackageFile({ ...missingPackage, code: "undefinedReference" })
    ).toBeNull()
  })
})

describe("usePackageRecovery", () => {
  /// The whole point of the flow: a dead-end diagnostic becomes one action.
  it("resolves a package and reconciles after installing it", async () => {
    const onInstalled = vi.fn<(name: string) => void>()
    const { result } = renderHook(() => usePackageRecovery({ onInstalled }))

    await act(() => result.current.resolve(missingPackage))
    await waitFor(() => expect(result.current.state.status).toBe("ready"))

    await act(() => result.current.install())
    await waitFor(() => expect(result.current.state.status).toBe("installed"))
    expect(installLatexPackage).toHaveBeenCalledTimes(1)
    // Reconciliation: the caller re-detects tools and offers a rebuild.
    expect(onInstalled).toHaveBeenCalledWith("algorithm2e")
  })

  /// A distribution that has no such package says so rather than offering an
  /// install that cannot work.
  it("states plainly when no package provides the file", async () => {
    resolved = null
    const { result } = renderHook(() =>
      usePackageRecovery({ onInstalled: vi.fn<(name: string) => void>() })
    )

    await act(() => result.current.resolve(missingPackage))

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "unresolved",
        file: "algorithm2e.sty",
      })
    )
  })

  /// A failed install keeps the reason and never claims the package arrived.
  it("retains the reason an install failed", async () => {
    installFails = true
    const onInstalled = vi.fn<(name: string) => void>()
    const { result } = renderHook(() => usePackageRecovery({ onInstalled }))

    await act(() => result.current.resolve(missingPackage))
    await waitFor(() => expect(result.current.state.status).toBe("ready"))
    await act(() => result.current.install())

    await waitFor(() => expect(result.current.state.status).toBe("error"))
    expect(onInstalled).not.toHaveBeenCalled()
  })

  it("installs nothing before a package has been resolved", async () => {
    const { result } = renderHook(() =>
      usePackageRecovery({ onInstalled: vi.fn<(name: string) => void>() })
    )

    await act(() => result.current.install())

    expect(installLatexPackage).not.toHaveBeenCalled()
    expect(result.current.state.status).toBe("idle")
  })
})
