import {Controller,Get,Post,Body,Req,Query,Param,UseGuards} from '@nestjs/common';
import {ApiKeyGuard} from '../auth/api-key.guard';import {CampaignService} from './campaign.service';
@Controller('campaigns')@UseGuards(ApiKeyGuard)
export class CampaignController{
 constructor(private readonly s:CampaignService){}
 @Get() campaigns(@Req() r:any){return this.s.campaigns(r.userId)}
 @Post() create(@Req() r:any,@Body() b:any){return this.s.createCampaign(r.userId,b)}
 @Get('contacts') contacts(@Req() r:any,@Query('limit')l?:string,@Query('offset')o?:string){return this.s.contacts(r.userId,Number(l||100),Number(o||0))}
 @Post('contacts') contact(@Req()r:any,@Body()b:any){return this.s.addContact(r.userId,b)}
 @Get('groups') groups(@Req()r:any){return this.s.groups(r.userId)}
 @Post('groups') group(@Req()r:any,@Body()b:any){return this.s.createGroup(r.userId,b)}
 @Post('groups/:id/members') member(@Req()r:any,@Param('id')id:string,@Body()b:any){return this.s.addToGroup(r.userId,id,b.contactIds||[])}
 @Get('templates') templates(@Req()r:any){return this.s.templates(r.userId)}
 @Post('templates') template(@Req()r:any,@Body()b:any){return this.s.createTemplate(r.userId,b)}
 @Post('contacts/import') importCsv(@Req()r:any,@Body()b:any){return this.s.importCsv(r.userId,b)}
 @Get('imports') imports(@Req()r:any){return this.s.imports(r.userId)}
}