import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { ResourcesModule } from "./resources/resources.module";
import { SyncModule } from "./sync/sync.module";

@Module({
  imports: [
    // A global floor; the credential endpoints tighten it further with
    // @Throttle. Sync will need its own, much higher, allowance in Phase 6.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 300 }]),
    AuthModule,
    ResourcesModule,
    SyncModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
