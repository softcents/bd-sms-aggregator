import {Module} from '@nestjs/common';
import {CampaignController} from './campaign.controller';
import {CampaignService} from './campaign.service';
import {QueueModule} from '../queue/queue.module';
@Module({imports:[QueueModule],controllers:[CampaignController],providers:[CampaignService]})
export class CampaignModule{}