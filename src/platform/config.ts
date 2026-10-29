import { parseBackendConfig, type BackendConfig } from '@/shared/lib/backendConfig';

/**
 * Where the app finds its backend. The web app fetches `/config.json`; the app is built with the same four public
 * values (an API URL and Cognito ids, no secrets) from EXPO_PUBLIC_DWELL_* in .env, see .env.example.
 * They are checked with the web's own `parseBackendConfig`. Missing or invalid values mean prototype mode, exactly
 * like the web without a config file.
 */
export interface ConfigEnv {
  apiUrl?: string;
  region?: string;
  userPoolId?: string;
  userPoolClientId?: string;
}

// Expo inlines EXPO_PUBLIC_* at build time only in this exact `process.env.NAME` form, so each is read by name.
const buildEnv = (): ConfigEnv => ({
  apiUrl: process.env.EXPO_PUBLIC_DWELL_API_URL,
  region: process.env.EXPO_PUBLIC_DWELL_REGION,
  userPoolId: process.env.EXPO_PUBLIC_DWELL_USER_POOL_ID,
  userPoolClientId: process.env.EXPO_PUBLIC_DWELL_USER_POOL_CLIENT_ID,
});

/** Never throws. null means prototype mode. */
export function backendConfigFromEnv(env: ConfigEnv = buildEnv()): BackendConfig | null {
  const trimmed = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  return parseBackendConfig(trimmed);
}
