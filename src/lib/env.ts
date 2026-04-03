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
