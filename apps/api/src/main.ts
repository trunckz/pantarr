import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { assertConfig, config } from "./config";
import { loadPlugins } from "./connectors/plugins";

async function bootstrap() {
  assertConfig();
  if (config.mode === "self-hosted") loadPlugins(config.connectorsDir);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });   // raw body: billing webhook signatures
  configureApp(app);
  const doc = new DocumentBuilder().setTitle("Pantarr API").setVersion("0.1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", description: "API key (ptr_…)" }).addCookieAuth("pantarr_session").build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, doc));
  await app.listen(config.port, "0.0.0.0");
  new Logger("pantarr").log(`listening on ${config.port} (${config.baseUrl})`);
}
bootstrap();
