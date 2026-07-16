export type LatestRequest = Readonly<{
  begin: () => number
  invalidate: () => void
  isCurrent: (request: number) => boolean
}>

/** Assigns monotonic identities so stale asynchronous results fail closed. */
export function createLatestRequest(): LatestRequest {
  let revision = 0
  return {
    begin: () => ++revision,
    invalidate: () => {
      revision += 1
    },
    isCurrent: (request) => request === revision,
  }
}
