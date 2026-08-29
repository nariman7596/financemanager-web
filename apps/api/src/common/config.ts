/** Environment the API needs, validated once at boot so it fails loudly. */
export function apiConfig() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (see .env.example)");
  }
  return {
    secret,
    port: Number(process.env.API_PORT ?? 3001),
    // Short-lived, because it cannot be revoked before it expires. Revocation
    // happens on the refresh token, which is stored and can be killed.
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlSeconds: 60 * 60 * 24 * 60,
  };
}
