/**
 * Validates required environment variables at application startup.
 * Throws if any required variable is missing.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required: string[] = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
  ];

  const missing: string[] = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return config;
}
