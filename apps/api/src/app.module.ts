import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { AuthController } from './auth/auth.controller';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { QueueModule } from './queue/queue.module';
import { SmsModule } from './sms/sms.module';

@Module({
  imports: [DatabaseModule, AuthModule, QueueModule, SmsModule],
  controllers: [HealthController, AuthController],
})
export class AppModule {}
