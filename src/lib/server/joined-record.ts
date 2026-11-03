function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Existing forward foreign keys embed one object or null. Do not pick an
// arbitrary row if an unexpected to-many projection arrives at this boundary.
export function joinedRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
