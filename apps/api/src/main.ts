import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { apiConfig } from "./common/config";
import { SerializeInterceptor } from "./common/serialize.interceptor";

async function bootstrap() {
  const cfg = apiConfig();
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });

  // Everything lives under a version prefix from day one: mobile clients stay
  // installed for a long time, and a breaking change needs somewhere to go
  // that does not break the app already on someone's phone.
  app.setGlobalPrefix("api/v1");
  app.useGlobalInterceptors(new SerializeInterceptor());
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("FinanceManager API")
      .setDescription(
        "Transport for the mobile client. Every owned resource is scoped to " +
          "the household resolved from the caller's Membership; the " +
          "X-Household-Id header is only a preference.",
      )
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/v1/docs", app, doc);

  await app.listen(cfg.port, "0.0.0.0");
  new Logger("bootstrap").log(`API listening on :${cfg.port}`);
}

void bootstrap();
