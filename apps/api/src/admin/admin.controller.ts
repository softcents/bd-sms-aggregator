import { Body,Controller,Get,Param,Patch,Post,Query,Req,UseGuards,BadRequestException,NotFoundException } from '@nestjs/common';
import crypto from 'crypto';
import { PostgresService } from '../db/postgres.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AdminGuard } from './admin.guard';
import { hashPassword } from '../auth/password';

@Controller('admin')
@UseGuards(ApiKeyGuard,AdminGuard)
export class AdminController{
  constructor(private readonly db:PostgresService){}

  @Get('customers')
  async customers(@Query('status') status?:string,@Query('limit') limit?:string,@Query('offset') offset?:string){
    const l=Math.min(Math.max(Number(limit||50),1),200);const o=Math.max(Number(offset||0),0);
    const params:any[]=[];let where='WHERE role=\'customer\'';
    if(status){params.push(status);where+=' AND status=$'+params.length}
    params.push(l,o);
    const q=await this.db.pool.query('SELECT id,name,username,email,role,status,balance,"createdAt" FROM "User" '+where+' ORDER BY id DESC LIMIT $'+(params.length-1)+' OFFSET $'+params.length,params);
    return q.rows;
  }

  @Post('customers')
  async createCustomer(@Body() b:any){
    const name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
    if(!name||!username||!email||password.length<8)throw new BadRequestException('name, username, email and password(min 8) are required');
    const client=await this.db.pool.connect();
    try{
      await client.query('BEGIN');
      const exists=await client.query('SELECT id FROM "User" WHERE username=$1 OR email=$2 LIMIT 1',[username,email]);
      if(exists.rowCount)throw new BadRequestException('Username or email already exists');
      const q=await client.query('INSERT INTO "User" (name,username,email,"passwordHash",role,status,balance,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'customer\',\'active\',0,NOW(),NOW()) RETURNING id,name,username,email,status,balance', [name,username,email,hashPassword(password)]);
      if(b.tariffPlanId){
        await client.query('INSERT INTO "TariffPlanAssignment" ("userId","tariffPlanId","effectiveFrom") VALUES ($1,$2,NOW())',[q.rows[0].id,String(b.tariffPlanId)]);
      }
      await client.query('COMMIT');return q.rows[0];
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }

  @Patch('customers/:id')
  async updateCustomer(@Param('id') id:string,@Body() b:any){
    const fields:string[]=[];const vals:any[]=[];
    if(b.name!==undefined){fields.push('name=$'+(vals.length+1));vals.push(String(b.name).trim())}
    if(b.email!==undefined){fields.push('email=$'+(vals.length+1));vals.push(String(b.email).trim().toLowerCase())}
    if(b.status!==undefined){if(!['active','suspended','pending','disabled'].includes(String(b.status)))throw new BadRequestException('Invalid status');fields.push('status=$'+(vals.length+1));vals.push(String(b.status))}
    if(b.password!==undefined){if(String(b.password).length<8)throw new BadRequestException('Password must be at least 8 characters');fields.push('"passwordHash"=$'+(vals.length+1));vals.push(hashPassword(String(b.password)))}
    if(!fields.length)throw new BadRequestException('No changes supplied');
    vals.push(id);const q=await this.db.pool.query('UPDATE "User" SET '+fields.join(',')+',"updatedAt"=NOW() WHERE id=$'+vals.length+' AND role=\'customer\' RETURNING id,name,username,email,status,balance');
    if(!q.rowCount)throw new NotFoundException('Customer not found');return q.rows[0];
  }

  @Get('deposits')
  async deposits(@Query('status') status?:string){
    const params:any[]=[];let where='';
    if(status){params.push(status);where='WHERE d.status=$1'}
    const q=await this.db.pool.query('SELECT d.id,d."userId",u.username,u.name,d.amount,d.status,d.reference,d.provider,d.metadata,d."createdAt" FROM "Deposit" d JOIN "User" u ON u.id=d."userId" '+where+' ORDER BY d.id DESC LIMIT 200',params);
    return q.rows;
  }

  @Post('deposits/:id/approve')
  async approveDeposit(@Req() req:any,@Param('id') id:string){
    const client=await this.db.pool.connect();
    try{
      await client.query('BEGIN');
      const d=await client.query('SELECT id,"userId",amount,status,reference FROM "Deposit" WHERE id=$1 FOR UPDATE',[id]);
      if(!d.rowCount)throw new NotFoundException('Deposit not found');
      if(d.rows[0].status!=='pending')throw new BadRequestException('Deposit is already '+d.rows[0].status);
      const u=await client.query('SELECT balance,status FROM "User" WHERE id=$1 FOR UPDATE',[d.rows[0].userId]);
      if(!u.rowCount||u.rows[0].status==='disabled')throw new BadRequestException('Customer unavailable');
      const before=Number(u.rows[0].balance);const amount=Number(d.rows[0].amount);const after=(before+amount).toFixed(6);
      await client.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after,d.rows[0].userId]);
      const txRef='DEP-'+id+'-'+crypto.randomUUID();
      await client.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,\'credit\',$3,$4,$5,NOW())',[d.rows[0].userId,d.rows[0].amount,before.toFixed(6),after,'Deposit approved '+(d.rows[0].reference||txRef)]);
      await client.query('UPDATE "Deposit" SET status=\'approved\',metadata=COALESCE(metadata,\'{}\'::jsonb)||$1::jsonb WHERE id=$2',[JSON.stringify({approvedBy:String(req.userId),approvedAt:new Date().toISOString()}),id]);
      await client.query('COMMIT');return {status:'approved',depositId:id,balanceAfter:after};
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }

  @Post('deposits/:id/reject')
  async rejectDeposit(@Req() req:any,@Param('id') id:string,@Body() b:any){
    const reason=String(b.reason||'Rejected by admin').slice(0,250);
    const q=await this.db.pool.query('UPDATE "Deposit" SET status=\'rejected\',metadata=COALESCE(metadata,\'{}\'::jsonb)||$1::jsonb WHERE id=$2 AND status=\'pending\' RETURNING id,status',[JSON.stringify({rejectedBy:String(req.userId),reason,rejectedAt:new Date().toISOString()}),id]);
    if(!q.rowCount)throw new NotFoundException('Pending deposit not found');
    return q.rows[0];
  }
}