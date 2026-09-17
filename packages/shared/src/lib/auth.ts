import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

/**
 * OIDC Authorization Code + PKCE через expo-auth-session.
 *
 * Параметри (clientId, authority, redirectUri) — з `app.json.extra`. Custom URI
 * scheme `ua.transport.inspector://oauth2/callback` має бути зареєстрований у
 * провайдера. Tokens зберігаються у expo-secure-store
 * (Keychain iOS / Keystore Android).
 */

WebBrowser.maybeCompleteAuthSession();

const SECURE_KEYS = {
  accessToken: 'transport.accessToken',
  refreshToken: 'transport.refreshToken',
  idToken: 'transport.idToken',
  expiresAt: 'transport.expiresAt',
} as const;

const extra = (Constants.expoConfig?.extra ?? {}) as {
  oidcAuthority?: string;
  oidcClientId?: string;
  oidcRedirectUri?: string;
};

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: number;
}

export async function getDiscovery(): Promise<AuthSession.DiscoveryDocument> {
  if (!extra.oidcAuthority) {
    throw new Error('oidcAuthority not configured у app.json extra');
  }
  return AuthSession.fetchDiscoveryAsync(extra.oidcAuthority);
}

export function buildAuthRequest(): AuthSession.AuthRequest {
  const clientId = extra.oidcClientId ?? 'transport-inspector';
  const redirectUri = extra.oidcRedirectUri ?? 'ua.transport.inspector://oauth2/callback';
  return new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
}

export async function persistTokens(tokens: Tokens): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.accessToken, tokens.accessToken);
  await SecureStore.setItemAsync(SECURE_KEYS.refreshToken, tokens.refreshToken);
  if (tokens.idToken) await SecureStore.setItemAsync(SECURE_KEYS.idToken, tokens.idToken);
  await SecureStore.setItemAsync(SECURE_KEYS.expiresAt, tokens.expiresAt.toString());
}

export async function loadTokens(): Promise<Tokens | null> {
  const accessToken = await SecureStore.getItemAsync(SECURE_KEYS.accessToken);
  const expiresAtStr = await SecureStore.getItemAsync(SECURE_KEYS.expiresAt);
  if (!accessToken || !expiresAtStr) return null;
  const refreshToken = (await SecureStore.getItemAsync(SECURE_KEYS.refreshToken)) ?? '';
  const idToken = await SecureStore.getItemAsync(SECURE_KEYS.idToken);
  return {
    accessToken,
    refreshToken,
    idToken: idToken ?? undefined,
    expiresAt: Number.parseInt(expiresAtStr, 10),
  };
}

/** Зберігає JWT після email/password логіну (без refresh token). */
export async function saveLoginToken(accessToken: string): Promise<void> {
  const expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 днів
  await SecureStore.setItemAsync(SECURE_KEYS.accessToken, accessToken);
  await SecureStore.setItemAsync(SECURE_KEYS.expiresAt, expiresAt.toString());
}

export async function clearTokens(): Promise<void> {
  for (const k of Object.values(SECURE_KEYS)) {
    await SecureStore.deleteItemAsync(k);
  }
}

export async function exchangeCodeForTokens(
  request: AuthSession.AuthRequest,
  authCode: string,
  discovery: AuthSession.DiscoveryDocument,
): Promise<Tokens> {
  const clientId = extra.oidcClientId ?? 'transport-inspector';
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: authCode,
      redirectUri: request.redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    discovery,
  );
  return {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken ?? '',
    idToken: tokenResult.idToken,
    expiresAt: Date.now() + (tokenResult.expiresIn ?? 300) * 1000,
  };
}
