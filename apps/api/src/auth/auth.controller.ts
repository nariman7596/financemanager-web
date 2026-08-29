import { Body, Controller, Post, UsePipes } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { loginSchema, registerSchema } from "@financemanager/core/validation";
import { ZodValidationPipe } from "../common/zod.pipe";
import { AuthService } from "./auth.service";

const deviceSchema = z
  .object({
    id: z.string().uuid().optional(),
    platform: z.enum(["IOS", "ANDROID", "WEB"]).optional(),
    name: z.string().max(80).optional(),
  })
  .optional();

// The web app's own schemas, extended only with the device the mobile client
// identifies itself by.
const apiRegisterSchema = registerSchema.extend({
  locale: z.string().optional(),
  device: deviceSchema,
});
const apiLoginSchema = loginSchema.extend({ device: deviceSchema });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Credential endpoints are the ones worth brute-forcing, so they are the
  // ones that are rate limited.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  @UsePipes(new ZodValidationPipe(apiRegisterSchema))
  register(@Body() body: z.infer<typeof apiRegisterSchema>) {
    return this.auth.register(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @UsePipes(new ZodValidationPipe(apiLoginSchema))
  login(@Body() body: z.infer<typeof apiLoginSchema>) {
    return this.auth.login(body);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @UsePipes(new ZodValidationPipe(refreshSchema))
  logout(@Body() body: { refreshToken: string }) {
    return this.auth.logout(body.refreshToken);
  }
}
