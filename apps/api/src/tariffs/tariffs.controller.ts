import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TariffsService } from './tariffs.service';
@Controller('tariffs') @UseGuards(ApiKeyGuard)
export class TariffsController { constructor(private readonly tariffs:TariffsService){}
@Get() list(@Req() req:{userId:bigint}){return this.tariffs.list(req.userId);}
}
