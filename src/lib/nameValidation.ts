export function normalizePersonName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function isValidPersonName(value: string) {
  return /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(normalizePersonName(value))
}
