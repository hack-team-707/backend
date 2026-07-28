interface Environment {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  AUTH_SESSION_V2_ENABLED: boolean;
  REFRESH_TOKEN_ENABLED: boolean;
  CSRF_ENFORCED: boolean;
  MFA_ENFORCED: boolean;
  LEGACY_JWT_ALLOWED: boolean;
  RATE_LIMIT_MAX: number;
  AUTH_RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW_SECONDS: number;
  REDIS_URL?: string;
  MFA_ENCRYPTION_KEY?: string;
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
  AI_PROVIDER: 'disabled' | 'nvidia' | 'openai' | 'anthropic' | 'gemini' | 'bedrock';
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
  BEDROCK_REGION: string;
  BEDROCK_MODEL: string;
  BEDROCK_MODEL_COMPLEX: string;
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
  FINANCIAL_FEATURE_ENABLED: boolean;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  MERCADO_PAGO_BASE_URL: string;
  MERCADO_PAGO_NOTIFICATION_URL?: string;
  MERCADO_PAGO_BACK_URLS?: string;
  MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS: number;
  MULTI_SELLER_SPLIT_ENABLED: boolean;
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
  const jwtAccessExpiresIn =
    typeof raw.JWT_ACCESS_EXPIRES_IN === 'string'
      ? raw.JWT_ACCESS_EXPIRES_IN
      : '15m';
  const jwtRefreshExpiresIn =
    typeof raw.JWT_REFRESH_EXPIRES_IN === 'string'
      ? raw.JWT_REFRESH_EXPIRES_IN
      : '7d';
  const jwtIssuer =
    typeof raw.JWT_ISSUER === 'string' && raw.JWT_ISSUER.trim()
      ? raw.JWT_ISSUER.trim()
      : 'resolve-platform';
  const jwtAudience =
    typeof raw.JWT_AUDIENCE === 'string' && raw.JWT_AUDIENCE.trim()
      ? raw.JWT_AUDIENCE.trim()
      : 'resolve-platform-web';
  const booleanValue = (name: string, fallback: boolean): boolean => {
    const value = raw[name] ?? fallback;
    if (![true, false, 'true', 'false'].includes(value as never))
      throw new Error(`${name} must be true or false`);
    return value === true || value === 'true';
  };
  const sessionV2Enabled = booleanValue('AUTH_SESSION_V2_ENABLED', false);
  const refreshTokenEnabled = booleanValue('REFRESH_TOKEN_ENABLED', false);
  const csrfEnforced = booleanValue('CSRF_ENFORCED', false);
  const mfaEnforced = booleanValue('MFA_ENFORCED', false);
  const legacyJwtAllowed = booleanValue('LEGACY_JWT_ALLOWED', true);
  const financialFeatureEnabled = booleanValue(
    'FINANCIAL_FEATURE_ENABLED',
    false,
  );
  const multiSellerSplitEnabled = booleanValue(
    'MULTI_SELLER_SPLIT_ENABLED',
    false,
  );
  const mercadoPagoWebhookToleranceSeconds = Number(
    raw.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS ?? 300,
  );
  const rateLimitMax = Number(raw.RATE_LIMIT_MAX ?? 120);
  const authRateLimitMax = Number(raw.AUTH_RATE_LIMIT_MAX ?? 10);
  const rateLimitWindowSeconds = Number(raw.RATE_LIMIT_WINDOW_SECONDS ?? 60);
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
  const mercadoPagoAccessToken = optionalString(raw.MERCADO_PAGO_ACCESS_TOKEN);
  const mercadoPagoWebhookSecret = optionalString(
    raw.MERCADO_PAGO_WEBHOOK_SECRET,
  );
  const mercadoPagoBaseUrl = (
    optionalString(raw.MERCADO_PAGO_BASE_URL) ?? 'https://api.mercadopago.com'
  ).replace(/\/$/, '');
  const mercadoPagoNotificationUrl = optionalString(
    raw.MERCADO_PAGO_NOTIFICATION_URL,
  );
  const mercadoPagoBackUrls = optionalString(raw.MERCADO_PAGO_BACK_URLS);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  const durationSeconds = (name: string, value: string): number => {
    const match = /^(\d+)(s|m|h|d)$/.exec(value);
    if (!match)
      throw new Error(`${name} must use s, m, h, or d duration syntax`);
    const factors = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    return Number(match[1]) * factors[match[2] as keyof typeof factors];
  };
  if (durationSeconds('JWT_ACCESS_EXPIRES_IN', jwtAccessExpiresIn) > 15 * 60) {
    throw new Error('JWT_ACCESS_EXPIRES_IN must not exceed 15 minutes');
  }
  if (
    durationSeconds('JWT_REFRESH_EXPIRES_IN', jwtRefreshExpiresIn) >
    7 * 86400
  ) {
    throw new Error('JWT_REFRESH_EXPIRES_IN must not exceed 7 days');
  }
  for (const [name, value, minimum, maximum] of [
    ['RATE_LIMIT_MAX', rateLimitMax, 1, 10000],
    ['AUTH_RATE_LIMIT_MAX', authRateLimitMax, 1, 100],
    ['RATE_LIMIT_WINDOW_SECONDS', rateLimitWindowSeconds, 1, 3600],
  ] as const) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(
        `${name} must be an integer between ${minimum} and ${maximum}`,
      );
    }
  }
  if (refreshTokenEnabled && !sessionV2Enabled) {
    throw new Error('REFRESH_TOKEN_ENABLED requires AUTH_SESSION_V2_ENABLED');
  }
  if ((csrfEnforced || mfaEnforced) && !sessionV2Enabled) {
    throw new Error(
      'CSRF_ENFORCED and MFA_ENFORCED require AUTH_SESSION_V2_ENABLED',
    );
  }
  if (
    nodeEnv === 'production' &&
    sessionV2Enabled &&
    !optionalString(raw.REDIS_URL)
  ) {
    throw new Error(
      'REDIS_URL is required for authentication V2 in production',
    );
  }
  if (
    typeof databaseUrl !== 'string' ||
    !/^postgres(?:ql)?:\/\//.test(databaseUrl)
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URI');
  }
  if (
    !['disabled', 'nvidia', 'openai', 'anthropic', 'gemini', 'bedrock'].includes(
      aiProvider,
    )
  ) {
    throw new Error(
      'AI_PROVIDER must be disabled, nvidia, openai, anthropic, gemini, or bedrock',
    );
  }
  if (
    aiProvider !== 'disabled' &&
    aiProvider !== 'bedrock' &&
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

  if (multiSellerSplitEnabled) {
    throw new Error(
      'MULTI_SELLER_SPLIT_ENABLED=true is not supported by this release',
    );
  }
  if (
    !Number.isInteger(mercadoPagoWebhookToleranceSeconds) ||
    mercadoPagoWebhookToleranceSeconds < 1 ||
    mercadoPagoWebhookToleranceSeconds > 3600
  ) {
    throw new Error(
      'MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS must be between 1 and 3600',
    );
  }
  const validFinancialUrl = (value: string): boolean => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' ||
        (nodeEnv !== 'production' &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
      );
    } catch {
      return false;
    }
  };
  if (
    !validFinancialUrl(mercadoPagoBaseUrl) ||
    !mercadoPagoBaseUrl.startsWith('https://')
  )
    throw new Error('MERCADO_PAGO_BASE_URL must be an HTTPS URL');
  let parsedBackUrls: Record<string, unknown> | undefined;
  if (mercadoPagoBackUrls) {
    try {
      const parsed = JSON.parse(mercadoPagoBackUrls) as unknown;
      if (parsed && typeof parsed === 'object')
        parsedBackUrls = parsed as Record<string, unknown>;
    } catch {
      parsedBackUrls = undefined;
    }
  }
  if (financialFeatureEnabled) {
    if (!mercadoPagoAccessToken)
      throw new Error(
        'MERCADO_PAGO_ACCESS_TOKEN is required when FINANCIAL_FEATURE_ENABLED=true',
      );
    if (!mercadoPagoWebhookSecret)
      throw new Error(
        'MERCADO_PAGO_WEBHOOK_SECRET is required when FINANCIAL_FEATURE_ENABLED=true',
      );
    if (!optionalString(raw.REDIS_URL))
      throw new Error(
        'REDIS_URL is required when FINANCIAL_FEATURE_ENABLED=true',
      );
    if (
      !mercadoPagoNotificationUrl ||
      !validFinancialUrl(mercadoPagoNotificationUrl)
    )
      throw new Error(
        'MERCADO_PAGO_NOTIFICATION_URL must be HTTPS (localhost HTTP is allowed in development)',
      );
    if (
      !parsedBackUrls ||
      !['success', 'failure', 'pending'].every(
        (name) =>
          typeof parsedBackUrls?.[name] === 'string' &&
          validFinancialUrl(parsedBackUrls[name] as string),
      )
    )
      throw new Error(
        'MERCADO_PAGO_BACK_URLS must be JSON with valid success, failure, and pending URLs',
      );
  }

  return {
    ...raw,
    NODE_ENV: nodeEnv,
    PORT: port,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    JWT_ACCESS_EXPIRES_IN: jwtAccessExpiresIn,
    JWT_REFRESH_EXPIRES_IN: jwtRefreshExpiresIn,
    JWT_ISSUER: jwtIssuer,
    JWT_AUDIENCE: jwtAudience,
    AUTH_SESSION_V2_ENABLED: sessionV2Enabled,
    REFRESH_TOKEN_ENABLED: refreshTokenEnabled,
    CSRF_ENFORCED: csrfEnforced,
    MFA_ENFORCED: mfaEnforced,
    LEGACY_JWT_ALLOWED: legacyJwtAllowed,
    RATE_LIMIT_MAX: rateLimitMax,
    AUTH_RATE_LIMIT_MAX: authRateLimitMax,
    RATE_LIMIT_WINDOW_SECONDS: rateLimitWindowSeconds,
    FINANCIAL_FEATURE_ENABLED: financialFeatureEnabled,
    ...(mercadoPagoAccessToken
      ? { MERCADO_PAGO_ACCESS_TOKEN: mercadoPagoAccessToken }
      : {}),
    ...(mercadoPagoWebhookSecret
      ? { MERCADO_PAGO_WEBHOOK_SECRET: mercadoPagoWebhookSecret }
      : {}),
    MERCADO_PAGO_BASE_URL: mercadoPagoBaseUrl,
    ...(mercadoPagoNotificationUrl
      ? { MERCADO_PAGO_NOTIFICATION_URL: mercadoPagoNotificationUrl }
      : {}),
    ...(mercadoPagoBackUrls
      ? { MERCADO_PAGO_BACK_URLS: mercadoPagoBackUrls }
      : {}),
    MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS: mercadoPagoWebhookToleranceSeconds,
    MULTI_SELLER_SPLIT_ENABLED: multiSellerSplitEnabled,
    ...(optionalString(raw.REDIS_URL)
      ? { REDIS_URL: optionalString(raw.REDIS_URL) }
      : {}),
    ...(optionalString(raw.MFA_ENCRYPTION_KEY)
      ? { MFA_ENCRYPTION_KEY: optionalString(raw.MFA_ENCRYPTION_KEY) }
      : {}),
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
    BEDROCK_REGION: optionalString(raw.BEDROCK_REGION) ?? 'us-east-1',
    BEDROCK_MODEL:
      optionalString(raw.BEDROCK_MODEL) ?? 'amazon.nova-micro-v1:0',
    BEDROCK_MODEL_COMPLEX:
      optionalString(raw.BEDROCK_MODEL_COMPLEX) ?? 'amazon.nova-pro-v1:0',
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
