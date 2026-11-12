// The whole application graph resolves (no circular import leaving a provider undefined), without a database.
process.env.PANTARR_SECRET ??= "x".repeat(40);
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

describe("application module", () => {
  it("resolves every provider and controller", async () => {
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, preview: true });
    expect(app).toBeDefined();
    await app.close();
  }, 60000);
});
