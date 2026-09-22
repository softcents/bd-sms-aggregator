import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { BillingService } from './billing.service';
@Controller('billing')
@UseGuards(ApiKeyGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('balance') balance(@Req() req:{userId:bigint}) { return this.billing.balance(req.userId); }
  @Get('transactions') transactions(@Req() req:{userId:bigint}, @Query('limit') limit?:string) { return this.billing.transactions(req.userId, Number(limit||50)); }
}
