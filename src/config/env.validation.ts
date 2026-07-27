interface Environment {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGINS: string;
  PUBLIC_APP_URL: string;
  DATABASE_URL: string;
  DB_SSL: boolean;
  DB_SYNCHRONIZE: boolean;
  DB_RUN_MIGRATIONS: boolean;
  DATA_ENCRYPTION_KEY: string;
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  AI_PROVIDER: 'disabled' | 'nvidia' | 'openai' | 'anthropic' | 'gemini';
  NVIDIA_API_KEY?: string;
  NVIDIA_MODEL: string;
  NVIDIA_BASE_URL: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  GEMINI_BASE_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  OPENAI_BASE_URL: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_BASE_URL: string;
  EXTERNAL_OPPORTUNITIES_ENABLED: boolean;
  EXTERNAL_OPPORTUNITIES_TIMEOUT_MS: number;
  MIN_INTERNAL_MATCH_COVERAGE: number;
  NO_MATCH_AI_GUIDANCE_ENABLED: boolean;
  HIMALAYAS_API_URL: string;
  FREELANCER_API_URL: string;
  FREELANCER_OAUTH_TOKEN?: string;
  FREELANCER_ENABLED: boolean;
  FREELANCER_ENVIRONMENT: 'sandbox' | 'production';
  FREELANCER_BASE_URL: string;
  FREELANCER_TIMEOUT_MS: number;
  GOOGLE_PLACES_ENABLED: boolean;
  GOOGLE_PLACES_API_KEY?: string;
  GOOGLE_PLACES_BASE_URL: string;
  GOOGLE_PLACES_LANGUAGE: string;
  GOOGLE_PLACES_REGION: string;
  GOOGLE_PLACES_DEFAULT_RADIUS_METERS: number;
  GOOGLE_PLACES_TIMEOUT_MS: number;
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): Environment & Record<string, unknown> {
  const nodeEnv =
    typeof raw.NODE_ENV === 'string' ? raw.NODE_ENV : 'development';
  const port = Number(raw.PORT ?? 3000);
  const jwtSecret = raw.JWT_SECRET;
  const jwtExpiresIn =
    typeof raw.JWT_EXPIRES_IN === 'string' ? raw.JWT_EXPIRES_IN : '1h';
  const corsOrigins =
    typeof raw.CORS_ORIGINS === 'string'
      ? raw.CORS_ORIGINS
      : 'http://localhost:3001';
  const publicAppUrl =
    typeof raw.PUBLIC_APP_URL === 'string' && raw.PUBLIC_APP_URL.trim()
      ? raw.PUBLIC_APP_URL.trim().replace(/\/$/, '')
      : 'http://localhost:3001';
  const databaseUrl = raw.DATABASE_URL;
  const sslValue = raw.DB_SSL ?? 'false';
  const synchronizeValue = raw.DB_SYNCHRONIZE ?? 'false';
  const migrationsValue = raw.DB_RUN_MIGRATIONS ?? 'false';
  const externalOpportunitiesValue =
    raw.EXTERNAL_OPPORTUNITIES_ENABLED ?? 'true';
  const externalOpportunitiesTimeout = Number(
    raw.EXTERNAL_OPPORTUNITIES_TIMEOUT_MS ?? 15000,
  );
  const minimumInternalMatchCoverage = Number(
    raw.MIN_INTERNAL_MATCH_COVERAGE ?? 60,
  );
  const noMatchAiGuidanceValue = raw.NO_MATCH_AI_GUIDANCE_ENABLED ?? 'true';
  const freelancerEnabledValue = raw.FREELANCER_ENABLED ?? 'true';
  const googlePlacesEnabledValue = raw.GOOGLE_PLACES_ENABLED ?? 'false';
  const freelancerTimeout = Number(raw.FREELANCER_TIMEOUT_MS ?? 8000);
  const googlePlacesTimeout = Number(raw.GOOGLE_PLACES_TIMEOUT_MS ?? 8000);
  const googlePlacesRadius = Number(
    raw.GOOGLE_PLACES_DEFAULT_RADIUS_METERS ?? 10000,
  );
  const dataEncryptionKey = raw.DATA_ENCRYPTION_KEY;
  const aiProvider =
    typeof raw.AI_PROVIDER === 'string' ? raw.AI_PROVIDER : 'disabled';
  const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const providerKeys = {
    nvidia: optionalString(raw.NVIDIA_API_KEY),
    gemini: optionalString(raw.GEMINI_API_KEY),
    openai: optionalString(raw.OPENAI_API_KEY),
    anthropic: optionalString(raw.ANTHROPIC_API_KEY),
  };
  const vapid = {
    subject: optionalString(raw.VAPID_SUBJECT),
    publicKey: optionalString(raw.VAPID_PUBLIC_KEY),
    privateKey: optionalString(raw.VAPID_PRIVATE_KEY),
  };
  const configuredVapidValues = Object.values(vapid).filter(Boolean).length;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  if (
    typeof databaseUrl !== 'string' ||
    !/^postgres(?:ql)?:\/\//.test(databaseUrl)
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URI');
  }
  if (
    !['disabled', 'nvidia', 'openai', 'anthropic', 'gemini'].includes(
      aiProvider,
    )
  ) {
    throw new Error(
      'AI_PROVIDER must be disabled, nvidia, openai, anthropic, or gemini',
    );
  }
  if (
    aiProvider !== 'disabled' &&
    !providerKeys[aiProvider as keyof typeof providerKeys]
  ) {
    throw new Error(
      `${aiProvider.toUpperCase()}_API_KEY is required when AI_PROVIDER=${aiProvider}`,
    );
  }
  if (!['true', 'false', true, false].includes(sslValue as never)) {
    throw new Error('DB_SSL must be true or false');
  }
  if (!['true', 'false', true, false].includes(synchronizeValue as never)) {
    throw new Error('DB_SYNCHRONIZE must be true or false');
  }
  if (!['true', 'false', true, false].includes(migrationsValue as never)) {
    throw new Error('DB_RUN_MIGRATIONS must be true or false');
  }
  if (
    !['true', 'false', true, false].includes(
      externalOpportunitiesValue as never,
    )
  ) {
    throw new Error('EXTERNAL_OPPORTUNITIES_ENABLED must be true or false');
  }
  if (
    !Number.isInteger(externalOpportunitiesTimeout) ||
    externalOpportunitiesTimeout < 1000 ||
    externalOpportunitiesTimeout > 20000
  ) {
    throw new Error(
      'EXTERNAL_OPPORTUNITIES_TIMEOUT_MS must be between 1000 and 20000',
    );
  }
  if (
    !Number.isFinite(minimumInternalMatchCoverage) ||
    minimumInternalMatchCoverage < 1 ||
    minimumInternalMatchCoverage > 100
  ) {
    throw new Error('MIN_INTERNAL_MATCH_COVERAGE must be between 1 and 100');
  }
  if (
    !['true', 'false', true, false].includes(noMatchAiGuidanceValue as never)
  ) {
    throw new Error('NO_MATCH_AI_GUIDANCE_ENABLED must be true or false');
  }
  for (const [name, value] of [
    ['FREELANCER_ENABLED', freelancerEnabledValue],
    ['GOOGLE_PLACES_ENABLED', googlePlacesEnabledValue],
  ] as const) {
    if (!['true', 'false', true, false].includes(value as never)) {
      throw new Error(`${name} must be true or false`);
    }
  }
  if (
    !Number.isInteger(freelancerTimeout) ||
    freelancerTimeout < 1000 ||
    freelancerTimeout > 20000 ||
    !Number.isInteger(googlePlacesTimeout) ||
    googlePlacesTimeout < 1000 ||
    googlePlacesTimeout > 20000
  ) {
    throw new Error('External talent timeouts must be between 1000 and 20000');
  }
  if (
    !Number.isInteger(googlePlacesRadius) ||
    googlePlacesRadius < 100 ||
    googlePlacesRadius > 50000
  ) {
    throw new Error(
      'GOOGLE_PLACES_DEFAULT_RADIUS_METERS must be between 100 and 50000',
    );
  }
  if (
    (googlePlacesEnabledValue === true ||
      googlePlacesEnabledValue === 'true') &&
    !optionalString(raw.GOOGLE_PLACES_API_KEY)
  ) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY is required when GOOGLE_PLACES_ENABLED=true',
    );
  }
  if (configuredVapidValues !== 0 && configuredVapidValues !== 3) {
    throw new Error(
      'VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY must be configured together',
    );
  }
  if (
    vapid.subject &&
    !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(vapid.subject)
  ) {
    throw new Error('VAPID_SUBJECT must be a mailto: or https: URI');
  }
  if (
    typeof dataEncryptionKey !== 'string' ||
    !/^[a-fA-F0-9]{64}$/.test(dataEncryptionKey)
  ) {
    throw new Error(
      'DATA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters',
    );
  }

  return {
    ...raw,
    NODE_ENV: nodeEnv,
    PORT: port,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    CORS_ORIGINS: corsOrigins,
    PUBLIC_APP_URL: publicAppUrl,
    DATABASE_URL: databaseUrl,
    DB_SSL: sslValue === true || sslValue === 'true',
    DB_SYNCHRONIZE: synchronizeValue === true || synchronizeValue === 'true',
    DB_RUN_MIGRATIONS: migrationsValue === true || migrationsValue === 'true',
    DATA_ENCRYPTION_KEY: dataEncryptionKey,
    ...(vapid.subject
      ? {
          VAPID_SUBJECT: vapid.subject,
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_KEY: vapid.privateKey,
        }
      : {}),
    AI_PROVIDER: aiProvider as Environment['AI_PROVIDER'],
    ...(providerKeys.nvidia ? { NVIDIA_API_KEY: providerKeys.nvidia } : {}),
    NVIDIA_MODEL:
      optionalString(raw.NVIDIA_MODEL) ?? 'nvidia/nvidia-nemotron-nano-9b-v2',
    NVIDIA_BASE_URL:
      optionalString(raw.NVIDIA_BASE_URL)?.replace(/\/$/, '') ??
      'https://integrate.api.nvidia.com/v1',
    ...(providerKeys.gemini ? { GEMINI_API_KEY: providerKeys.gemini } : {}),
    GEMINI_MODEL: optionalString(raw.GEMINI_MODEL) ?? 'gemini-2.0-flash',
    GEMINI_BASE_URL:
      optionalString(raw.GEMINI_BASE_URL)?.replace(/\/$/, '') ??
      'https://generativelanguage.googleapis.com/v1beta',
    ...(providerKeys.openai ? { OPENAI_API_KEY: providerKeys.openai } : {}),
    OPENAI_MODEL: optionalString(raw.OPENAI_MODEL) ?? 'gpt-5.6-sol',
    OPENAI_BASE_URL:
      optionalString(raw.OPENAI_BASE_URL)?.replace(/\/$/, '') ??
      'https://api.openai.com/v1',
    ...(providerKeys.anthropic
      ? { ANTHROPIC_API_KEY: providerKeys.anthropic }
      : {}),
    ANTHROPIC_MODEL:
      optionalString(raw.ANTHROPIC_MODEL) ?? 'claude-3-5-haiku-latest',
    ANTHROPIC_BASE_URL:
      optionalString(raw.ANTHROPIC_BASE_URL)?.replace(/\/$/, '') ??
      'https://api.anthropic.com/v1',
    EXTERNAL_OPPORTUNITIES_ENABLED:
      externalOpportunitiesValue === true ||
      externalOpportunitiesValue === 'true',
    EXTERNAL_OPPORTUNITIES_TIMEOUT_MS: externalOpportunitiesTimeout,
    MIN_INTERNAL_MATCH_COVERAGE: minimumInternalMatchCoverage,
    NO_MATCH_AI_GUIDANCE_ENABLED:
      noMatchAiGuidanceValue === true || noMatchAiGuidanceValue === 'true',
    HIMALAYAS_API_URL:
      optionalString(raw.HIMALAYAS_API_URL) ??
      'https://himalayas.app/jobs/api/search',
    FREELANCER_API_URL:
      optionalString(raw.FREELANCER_API_URL) ??
      'https://www.freelancer.com/api/projects/0.1/projects/active/',
    ...(optionalString(raw.FREELANCER_OAUTH_TOKEN)
      ? {
          FREELANCER_OAUTH_TOKEN: optionalString(raw.FREELANCER_OAUTH_TOKEN),
        }
      : {}),
    FREELANCER_ENABLED:
      freelancerEnabledValue === true || freelancerEnabledValue === 'true',
    FREELANCER_ENVIRONMENT:
      optionalString(raw.FREELANCER_ENVIRONMENT) === 'sandbox'
        ? 'sandbox'
        : 'production',
    FREELANCER_BASE_URL:
      optionalString(raw.FREELANCER_BASE_URL)?.replace(/\/$/, '') ??
      'https://www.freelancer.com',
    FREELANCER_TIMEOUT_MS: freelancerTimeout,
    GOOGLE_PLACES_ENABLED:
      googlePlacesEnabledValue === true || googlePlacesEnabledValue === 'true',
    ...(optionalString(raw.GOOGLE_PLACES_API_KEY)
      ? { GOOGLE_PLACES_API_KEY: optionalString(raw.GOOGLE_PLACES_API_KEY) }
      : {}),
    GOOGLE_PLACES_BASE_URL:
      optionalString(raw.GOOGLE_PLACES_BASE_URL)?.replace(/\/$/, '') ??
      'https://places.googleapis.com/v1',
    GOOGLE_PLACES_LANGUAGE: optionalString(raw.GOOGLE_PLACES_LANGUAGE) ?? 'es',
    GOOGLE_PLACES_REGION: optionalString(raw.GOOGLE_PLACES_REGION) ?? 'PE',
    GOOGLE_PLACES_DEFAULT_RADIUS_METERS: googlePlacesRadius,
    GOOGLE_PLACES_TIMEOUT_MS: googlePlacesTimeout,
  };
}
