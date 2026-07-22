const DEFAULT_STRING_LIMIT = 32 * 1024

export class IpcContractError extends Error {
  constructor(contract: string) {
    super(`TeX rejected an invalid ${contract} response.`)
    this.name = "IpcContractError"
  }
}

export function record(
  value: unknown,
  contract: string
): Record<string, unknown> {
  if (!isRecord(value)) throw new IpcContractError(contract)
  return value
}

export function stringValue(
  value: unknown,
  contract: string,
  maximumLength = DEFAULT_STRING_LIMIT
): string {
  if (typeof value !== "string" || value.length > maximumLength)
    throw new IpcContractError(contract)
  return value
}

export function nonEmptyString(
  value: unknown,
  contract: string,
  maximumLength = DEFAULT_STRING_LIMIT
): string {
  const parsed = stringValue(value, contract, maximumLength)
  if (parsed.length === 0) throw new IpcContractError(contract)
  return parsed
}

export function nullableString(
  value: unknown,
  contract: string,
  maximumLength = DEFAULT_STRING_LIMIT
): string | null {
  return value === null ? null : stringValue(value, contract, maximumLength)
}

export function booleanValue(value: unknown, contract: string): boolean {
  if (typeof value !== "boolean") throw new IpcContractError(contract)
  return value
}

export function finiteNumber(
  value: unknown,
  contract: string,
  minimum: number,
  maximum: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    throw new IpcContractError(contract)
  return value
}

export function integer(
  value: unknown,
  contract: string,
  minimum: number,
  maximum: number
): number {
  const parsed = finiteNumber(value, contract, minimum, maximum)
  if (!Number.isSafeInteger(parsed)) throw new IpcContractError(contract)
  return parsed
}

export function nullableInteger(
  value: unknown,
  contract: string,
  minimum: number,
  maximum: number
): number | null {
  return value === null ? null : integer(value, contract, minimum, maximum)
}

export function arrayValue<T>(
  value: unknown,
  contract: string,
  maximumLength: number,
  parse: (item: unknown) => T
): T[] {
  if (!Array.isArray(value) || value.length > maximumLength)
    throw new IpcContractError(contract)
  return value.map((item) => parse(item))
}

export function enumValue<const T extends string>(
  value: unknown,
  contract: string,
  allowed: readonly T[]
): T {
  const matched = allowed.find((candidate) => candidate === value)
  if (matched === undefined) throw new IpcContractError(contract)
  return matched
}

/** Rejects malformed event data without leaking payload content or throwing from the event loop. */
export function acceptEvent<T>(
  value: unknown,
  parse: (item: unknown) => T,
  handler: (item: T) => void
): boolean {
  try {
    handler(parse(value))
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
