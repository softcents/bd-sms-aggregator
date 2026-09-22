import { Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [SmsController],
  providers: [SmsService],
})
export class SmsModule {}
