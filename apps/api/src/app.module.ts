import { RecipesBridgeController } from "./recipes/recipes-bridge.controller";
import { BudgetController } from "./pantry/budget.controller";
import { BudgetService } from "./pantry/budget.service";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { ServeStaticModule } from "@nestjs/serve-static";
import { resolve } from "node:path";
import { AdminController } from "./admin/admin.controller";
import { RecipeViewController } from "./recipes/recipe-view.controller";
import { ApiKeysController } from "./api-keys/api-keys.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { OidcService } from "./auth/oidc.service";
import { I18nFilter } from "./common/i18n.filter";
import { config } from "./config";
import { ConnectorsService } from "./connectors/connectors.service";
import { ConnectorRegistry, ConnectorsController } from "./connectors/registry";
import { OauthController } from "./connectors/oauth/oauth.controller";
import { HouseholdsController } from "./households/households.controller";
import { BridgeController } from "./bridge/bridge.controller";
import { ListSyncController } from "./list-sync/list-sync.controller";
import { ListSyncService } from "./list-sync/list-sync.service";
import { BillingController } from "./hosted/billing";
import { GdprController } from "./hosted/gdpr.controller";
import { MailerService } from "./hosted/mailer.service";
import { ProvisioningService } from "./hosted/provisioning.service";
import { SignupController } from "./hosted/signup.controller";
import { JobsService } from "./jobs/jobs.service";
import { PlanningController } from "./planning/planning.controller";
import { PantryController } from "./pantry/pantry.controller";
import { ReceiptsController } from "./pantry/receipts.controller";
import { InboundController } from "./pantry/inbound.controller";
import { AdminConnectorsController } from "./admin/admin-connectors.controller";
import { ExtensionController } from "./extension/extension.controller";
import { StarterService } from "./recipes/starter.service";
import { ReceiptsService } from "./pantry/receipts.service";
import { PantryService } from "./pantry/pantry.service";
import { PurchasesService } from "./pantry/purchases.service";
import { LlmService } from "./planning/llm.service";
import { PlanningService } from "./planning/planning.service";
import { RecipesService } from "./recipes/recipes.service";
import { ShoppingController } from "./shopping/shopping.controller";
import { ShoppingService } from "./shopping/shopping.service";
import { FeedbackController } from "./feedback/feedback.controller";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.service";
import { SettingsController } from "./settings/settings.controller";
import { SettingsService } from "./settings/settings.service";
import { UsersController } from "./users/users.controller";

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    JwtModule.register({ global: true, secret: config.secret }),
    // The built web app, with the SPA fallback (every non-API path serves index.html)
    ServeStaticModule.forRoot({ rootPath: resolve(__dirname, "..", config.webDist), exclude: ["/api/{*rest}"] }),
  ],
  controllers: [ExtensionController, AdminConnectorsController, AdminController, RecipeViewController, HealthController, FeedbackController, AuthController, GdprController, UsersController, ApiKeysController, SettingsController, ConnectorsController, OauthController, HouseholdsController, PlanningController, ShoppingController, PantryController, BudgetController, RecipesBridgeController, ReceiptsController, InboundController, ListSyncController, BridgeController, SignupController, BillingController],
  providers: [StarterService, BudgetService, 
    AuthService, OidcService, SettingsService, ConnectorRegistry, ConnectorsService, JobsService, LlmService, PlanningService, ShoppingService, RecipesService, PantryService, PurchasesService, ReceiptsService, ListSyncService, MailerService, ProvisioningService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: I18nFilter },
  ],
})
export class AppModule {}
