import { describe, expect, it } from "vitest"

import { createLatestRequest } from "@/lib/latest-request"

describe("createLatestRequest", () => {
  it("accepts only the newest request", () => {
    const requests = createLatestRequest()
    const first = requests.begin()
    const second = requests.begin()

    expect(requests.isCurrent(first)).toBe(false)
    expect(requests.isCurrent(second)).toBe(true)
  })

  it("invalidates pending work during teardown", () => {
    const requests = createLatestRequest()
    const pending = requests.begin()
    requests.invalidate()

    expect(requests.isCurrent(pending)).toBe(false)
  })
})
