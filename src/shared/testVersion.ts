/**
 * Skill test runs are numbered with a 3-segment odometer that starts at 0.0.1: each of
 * minor/patch rolls 0→9 and carries (…0.0.9 → 0.1.0, 0.9.9 → 1.0.0). The version INDEX
 * `n` (1 = the first test) maps to "<major>.<minor>.<patch>". major can exceed 9 past 999.
 */
export function formatTestVersion(n: number): string {
  const i = Math.max(1, Math.floor(n))
  return `${Math.floor(i / 100)}.${Math.floor(i / 10) % 10}.${i % 10}`
}
