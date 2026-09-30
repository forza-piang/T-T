import { AddonsModule } from '../addons/addons.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PluginGuardsModule } from '../plugins/host/plugin-guards.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TripMembershipModule } from '../trip-membership/trip-membership.module';
import { BudgetController } from './budget.controller';
import { BudgetMcp } from './budget.mcp';
import { BudgetService } from './budget.service';
import { CostsRpc } from './costs.rpc';
import { ExchangeRatesRpc } from './exchange-rates.rpc';
import { ExchangeRatesService } from './exchange-rates.service';
import { ReceiptOcrController } from './receipt-ocr.controller';
import { ReceiptOcrService } from './receipt-ocr.service';
import { MiniMaxReceiptService } from './minimax-receipt.service';
import { Module } from '@nestjs/common';

/** Budget domain (S4 — Phase 2 trip sub-domain). Registered in AppModule.
 *  BudgetMcp carries the decorator-registered MCP tools + resources.
 *  AuthModule is deliberately absent (BudgetMcp's demo guard reads
 *  RuntimeEnvService + the users table, not AuthService) — that absence is
 *  what lets AuthModule import BudgetModule for UserCleanupService.
 *  AppConfigModule is @Global in the app graph; the explicit import keeps the
 *  partial e2e TestingModules resolving RuntimeEnvService.
 *  ReceiptOcrService is wired here because the controller is a sibling of
 *  BudgetController and shares its trip-scoped guards. */
@Module({
  imports: [
    McpSharedModule,
    PermissionsModule,
    AppConfigModule,
    RealtimeModule,
    PluginGuardsModule,
    AddonsModule,
    TripMembershipModule,
  ],
  controllers: [BudgetController, ReceiptOcrController],
  providers: [BudgetService, ExchangeRatesService, BudgetMcp, ExchangeRatesRpc, CostsRpc, ReceiptOcrService, MiniMaxReceiptService],
  // For in-container consumers (CostsRpc, TripsService,
  // ReservationsService, BookingImportService).
  exports: [BudgetService, ExchangeRatesService],
})
export class BudgetModule {}
