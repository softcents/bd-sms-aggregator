import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SendersService } from './senders.service';
@Controller('senders')
@UseGuards(ApiKeyGuard)
export class SendersController {
  constructor(private readonly senders: SendersService) {}
  @Get() list(@Req() req:{userId:bigint}) { return this.senders.list(req.userId); }
  @Post() create(@Req() req:{userId:bigint}, @Body() body:{sender:string}) { return this.senders.create(req.userId, body?.sender); }
  @Delete(':id') disable(@Req() req:{userId:bigint}, @Param('id') id:string) { return this.senders.disable(req.userId, BigInt(id)); }
}
