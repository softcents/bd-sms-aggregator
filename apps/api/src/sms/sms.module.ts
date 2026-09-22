import { Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { TariffsModule } from '../tariffs/tariffs.module';

@Module({
  imports: [AuthModule, QueueModule, TariffsModule],
  controllers: [SmsController],
  providers: [SmsService],
})
export class SmsModule {}
