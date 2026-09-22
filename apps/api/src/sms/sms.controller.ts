import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SendSmsInput, SmsService } from './sms.service';

@Controller('sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Post('send')
  @UseGuards(ApiKeyGuard)
  async send(@Req() request: { userId: bigint }, @Body() body: SendSmsInput) {
    return this.sms.send(request.userId, body);
  }
}
