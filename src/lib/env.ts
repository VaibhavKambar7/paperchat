export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }
  return value;
}

export function requireEnvs(names: string[], context?: string): void {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const scope = context ? ` in ${context}` : "";
    throw new Error(
      `[env] Missing required environment variables${scope}: ${missing.join(", ")}`,
    );
  }
}

export function getEnvInt(
  name: string,
  defaultValue: number,
  minValue: number = 0,
): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(
      `[env] ${name} must be a valid integer. Received: "${raw}"`,
    );
  }

  if (parsed < minValue) {
    throw new Error(
      `[env] ${name} must be >= ${minValue}. Received: ${parsed}`,
    );
  }

  return parsed;
}

export function getEnvFloat(
  name: string,
  defaultValue: number,
  minValue: number = Number.NEGATIVE_INFINITY,
): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`[env] ${name} must be a valid number. Received: "${raw}"`);
  }

  if (parsed < minValue) {
    throw new Error(
      `[env] ${name} must be >= ${minValue}. Received: ${parsed}`,
    );
  }

  return parsed;
}
