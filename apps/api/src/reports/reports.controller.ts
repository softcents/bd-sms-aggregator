import { Controller, Get, Param, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller('reports')
@UseGuards(ApiKeyGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  private uid(req:any){ if(!req.userId) throw new UnauthorizedException(); return String(req.userId); }

  @Get('summary') summary(@Req() req:any){ return this.reports.summary(this.uid(req)); }
  @Get('batches/:id') batch(@Req() req:any,@Param('id') id:string){ return this.reports.batch(this.uid(req),id); }

  @Get('messages')
  messages(@Req() req:any,@Query('limit') limit?:string,@Query('offset') offset?:string,@Query('status') status?:string){
    return this.reports.messages(this.uid(req),Number(limit||50),Number(offset||0),status);
  }
}
