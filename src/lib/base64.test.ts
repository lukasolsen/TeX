import { describe, expect, it } from "vitest"

import { decodeBase64, encodeUtf8Base64 } from "@/lib/base64"

describe("encodeUtf8Base64", () => {
  it("encodes ASCII", () => {
    expect(encodeUtf8Base64("hello")).toBe("aGVsbG8=")
  })

  it("encodes multi-byte UTF-8 by its bytes", () => {
    // "é" is U+00E9 -> UTF-8 bytes 0xC3 0xA9 -> base64 "w6k=".
    expect(encodeUtf8Base64("é")).toBe("w6k=")
  })

  it("encodes the empty string", () => {
    expect(encodeUtf8Base64("")).toBe("")
  })
})

describe("decodeBase64", () => {
  it("decodes to raw bytes", () => {
    expect(Array.from(decodeBase64("aGk="))).toEqual([104, 105])
  })

  it("round-trips UTF-8 through a TextDecoder", () => {
    const text = "café ☕ — naïve"
    const bytes = decodeBase64(encodeUtf8Base64(text))
    expect(new TextDecoder().decode(bytes)).toBe(text)
  })

  it("decodes the empty string to an empty array", () => {
    expect(decodeBase64("").length).toBe(0)
  })
})
