import { describe, expect, it } from "vitest"

import { clamp, clampInt } from "@/lib/math"

describe("clamp", () => {
  it("returns the value when already inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it("clamps to the bounds", () => {
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(42, 0, 10)).toBe(10)
  })

  it("does not round", () => {
    expect(clamp(2.7, 0, 10)).toBe(2.7)
  })

  it("yields the minimum for non-finite input", () => {
    expect(clamp(Number.NaN, 1, 10)).toBe(1)
    expect(clamp(Number.POSITIVE_INFINITY, 1, 10)).toBe(1)
    expect(clamp(Number.NEGATIVE_INFINITY, 1, 10)).toBe(1)
  })
})

describe("clampInt", () => {
  it("clamps and rounds to the nearest integer", () => {
    expect(clampInt(2.7, 0, 10)).toBe(3)
    expect(clampInt(2.4, 0, 10)).toBe(2)
  })

  it("respects the bounds before rounding", () => {
    expect(clampInt(10.6, 0, 10)).toBe(10)
    expect(clampInt(-0.6, 0, 10)).toBe(0)
  })

  it("yields the minimum for non-finite input", () => {
    expect(clampInt(Number.NaN, 2, 10)).toBe(2)
  })
})
