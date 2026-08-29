import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, createHousehold } from "@financemanager/db";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@financemanager/i18n/config";
import { TokensService } from "./tokens.service";

@Injectable()
export class AuthService {
  constructor(private readonly tokens: TokensService) {}

  private async issueSession(user: { id: string; email: string }, deviceId: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken({ userId: user.id, email: user.email }),
      this.tokens.issueRefreshToken(user.id, deviceId),
    ]);
    const households = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { household: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email },
      households: households.map((m) => ({
        id: m.householdId,
        name: m.household.name,
        baseCurrency: m.household.baseCurrency,
        role: m.role,
      })),
    };
  }

  async register(input: {
    name: string;
    email: string;
    password: string;
    baseCurrency: string;
    locale?: string;
    device?: { id?: string };
  }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("That email is already registered");

    const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        baseCurrency: input.baseCurrency,
        locale,
      },
    });

    // Same bootstrap the web app uses, so a household created through the API
    // is indistinguishable from one created in the browser.
    await createHousehold(user.id, `${input.name}'s Household`, input.baseCurrency, locale);

    return this.issueSession(user, await this.deviceId(user.id, input.device?.id));
  }

  async login(input: { email: string; password: string; device?: { id?: string; platform?: string; name?: string } }) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Compare against a dummy hash when the user does not exist so that a
    // missing account and a wrong password take the same time to answer.
    const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
    const ok = await bcrypt.compare(input.password, hash);
    if (!user || !ok) throw new UnauthorizedException("Incorrect email or password");

    return this.issueSession(
      user,
      await this.deviceId(user.id, input.device?.id, input.device?.platform, input.device?.name),
    );
  }

  async refresh(refreshToken: string) {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: rotated.userId } });
    const accessToken = await this.tokens.signAccessToken({ userId: user.id, email: user.email });
    return { accessToken, refreshToken: rotated.token };
  }

  async logout(refreshToken: string) {
    await this.tokens.revokeRefreshToken(refreshToken);
    return { ok: true };
  }

  /** Register (or touch) the calling installation. */
  private async deviceId(userId: string, id?: string, platform = "WEB", name?: string) {
    const deviceId = id ?? randomUUID();
    await prisma.device.upsert({
      where: { id: deviceId },
      create: { id: deviceId, userId, platform, name },
      update: { lastSeenAt: new Date() },
    });
    return deviceId;
  }
}
