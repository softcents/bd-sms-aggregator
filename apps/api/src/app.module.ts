import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { AuthController } from './auth/auth.controller';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [HealthController, AuthController],
})
export class AppModule {}
