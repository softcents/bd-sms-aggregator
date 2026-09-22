import { Module } from '@nestjs/common';
import { InfozillionService } from './infozillion.service';

@Module({providers:[InfozillionService],exports:[InfozillionService]})
export class InfozillionModule {}