import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from './sms/sms.module';
import { InfozillionModule } from './infozillion/infozillion.module';

@Module({imports:[ConfigModule.forRoot({isGlobal:true}),InfozillionModule,SmsModule]})
export class AppModule {}