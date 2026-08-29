import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@financemanager/db";
import { apiConfig } from "../common/config";

export interface AccessClaims {
  userId: string;
  email: string;
}

/**
 * Access tokens and refresh-token rotation.
 *
 * A refresh token is opaque random bytes; only its sha256 is stored, so a
 * database leak does not hand over live sessions. Rotation is what makes theft
 * detectable: each refresh issues a new token in the same `family` and revokes
 * the old one, so a stolen token being replayed after the legitimate client has
 * already rotated is unmistakable — and the whole family is killed.
 */
@Injectable()
export class TokensService {
  private readonly cfg = apiConfig();
  private readonly key = new TextEncoder().encode(apiConfig().secret);

  async signAccessToken(claims: AccessClaims): Promise<string> {
    return new SignJWT({ ...claims, scope: "api" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${this.cfg.accessTokenTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      // A web session cookie is signed with the same secret but carries no
      // `scope`, so it cannot be replayed as an API bearer token.
      if (payload.scope !== "api") throw new Error("wrong scope");
      return { userId: String(payload.userId), email: String(payload.email) };
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Issue a refresh token, optionally continuing an existing family. */
  async issueRefreshToken(userId: string, deviceId: string, familyId?: string) {
    const token = randomBytes(32).toString("base64url");
    await prisma.refreshToken.create({
      data: {
        userId,
        deviceId,
        tokenHash: this.hash(token),
        familyId: familyId ?? randomUUID(),
        expiresAt: new Date(Date.now() + this.cfg.refreshTokenTtlSeconds * 1000),
      },
    });
    return token;
  }

  /**
   * Rotate a refresh token. Throws 401 for anything suspicious, and revokes the
   * entire family when an already-rotated token is presented again.
   */
  async rotateRefreshToken(token: string) {
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!row) throw new UnauthorizedException("Invalid refresh token");

    if (row.revokedAt) {
      // Reuse of a rotated token: either the token was stolen and replayed, or
      // the legitimate client is replaying an old one. Both mean this family
      // can no longer be trusted, so every session in it dies.
      await prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token reuse detected");
    }

    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const next = await this.issueRefreshToken(row.userId, row.deviceId, row.familyId);
    return { token: next, userId: row.userId, deviceId: row.deviceId };
  }

  /** Revoke a single session (logout). Idempotent. */
  async revokeRefreshToken(token: string) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
