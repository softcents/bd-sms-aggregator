import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import { QueueService } from '../queue/queue.service';
import { PostgresService } from '../db/postgres.service';
import { SendSmsDto } from './dto/send-sms.dto';

function normalizeMsisdn(v:string){
  const d=v.replace(/\D/g,'');
  if(d.startsWith('880')) return d;
  if(d.startsWith('0')) return '880'+d.slice(1);
  return '880'+d;
}
function parts(body:string,unicode:boolean){
  const n=Array.from(body).length;
  return unicode ? (n<=70?1:Math.ceil(n/67)) : (n<=160?1:Math.ceil(n/153));
}
function sqlValues(rows:any[],columns:number){
  const values:string[]=[]; const params:any[]=[];
  rows.forEach((row,i)=>{
    const p=row.map((v:any,j:number)=>{params.push(v);return '$'+(i*columns+j+1)});
    values.push('('+p.join(',')+')');
  });
  return {sql:values.join(','),params};
}

@Injectable()
export class SmsService {
 constructor(private readonly queue:QueueService,private readonly db:PostgresService){}

 async send(dto:SendSmsDto,userId?:string,idempotencyKey?:string){
  if(!userId)throw new UnauthorizedException('Authenticated user required');
  const userIdBigInt=BigInt(userId);
  if(!dto.to?.length)throw new BadRequestException('Recipient list is empty');
  const recipients=[...new Set(dto.to.map(normalizeMsisdn))];
  const batchExternal=crypto.randomUUID();
  const idem=idempotencyKey?.trim()||null;
  if(idem){const existing=await this.db.pool.query('SELECT "externalId","totalRecipients" FROM "Batch" WHERE "userId"=$1 AND "idempotencyKey"=$2 LIMIT 1',[userIdBigInt.toString(),idem]);if(existing.rowCount)return {status:'accepted',provider:'InfoZillion',batchId:existing.rows[0].externalId,recipients:existing.rows[0].totalRecipients,idempotent:true};}
  const unicode=dto.isUnicode??/[\u0080-\uFFFF]/u.test(dto.body);
  const messageParts=parts(dto.body,unicode);
  await this.db.tx(async c=>{
    const u=await c.query('SELECT id,status,balance FROM "User" WHERE id=$1 FOR UPDATE',[userIdBigInt.toString()]);
    if(!u.rowCount||u.rows[0].status!=='active')throw new UnauthorizedException('User is not active');
    let sender:any=null;
    if(/^\d+$/.test(dto.senderId)){
      const q=await c.query('SELECT id,"senderId",type,"billMsisdn" FROM "Sender" WHERE id=$1 AND "userId"=$2 AND status=$3',[dto.senderId,userIdBigInt.toString(),'active']);
      if(q.rowCount)sender=q.rows[0];
    }else{
      const q=await c.query('SELECT id,"senderId",type,"billMsisdn" FROM "Sender" WHERE "userId"=$1 AND "senderId"=$2 AND status=$3',[userIdBigInt.toString(),dto.senderId,'active']);
      if(q.rowCount)sender=q.rows[0];
    }
    if(!sender)throw new BadRequestException('Sender not found or inactive');
    const prefixes=(await c.query('SELECT o.id,o.code,p.prefix FROM "OperatorPrefix" p JOIN "Operator" o ON o.id=p."operatorId" WHERE p.enabled AND o.enabled ORDER BY length(p.prefix) DESC')).rows;
    const rateRows=(await c.query(`SELECT DISTINCT ON (tr."operatorId") tr."operatorId",tr."maskingPrice",tr."nonMaskingPrice"
      FROM "TariffRate" tr JOIN "TariffPlanAssignment" a ON a."tariffPlanId"=tr."tariffPlanId"
      WHERE a."userId"=$1 AND a."effectiveFrom"<=NOW() AND tr."effectiveFrom"<=NOW()
      ORDER BY tr."operatorId",a."effectiveFrom" DESC,tr."effectiveFrom" DESC`,[userIdBigInt.toString()])).rows;
    const rates=new Map(rateRows.map((x:any)=>[String(x.operatorId),x]));
    const masking=['masking','alphanumeric','numeric'].includes(String(sender.type||'').toLowerCase());
    const staged:any[]=[];let total=new Decimal(0);
    for(const to of recipients){
      const op=prefixes.find((x:any)=>to.startsWith(String(x.prefix)));
      if(!op)throw new BadRequestException('No operator mapping for '+to);
      const rate=rates.get(String(op.id));if(!rate)throw new BadRequestException('No tariff rate for operator '+op.code);
      const unit=masking?rate.maskingPrice:rate.nonMaskingPrice;
      const cost=new Decimal(String(unit)).mul(messageParts);if(cost.lte(0))throw new BadRequestException('Invalid SMS tariff');
      total=total.add(cost);staged.push([to,String(op.id),String(unit),cost.toFixed(6),messageParts]);
    }
    const before=new Decimal(String(u.rows[0].balance));if(before.lt(total))throw new BadRequestException('Insufficient balance');
    const batch=(await c.query('INSERT INTO "Batch" ("externalId","userId","senderId",body,status,"totalRecipients","validCount","createdAt","updatedAt","idempotencyKey") VALUES ($1,$2,$3,$4,\'planning\',$5,$5,NOW(),NOW(),$6) RETURNING id',[batchExternal,userIdBigInt.toString(),sender.id,dto.body,staged.length,idem])).rows[0];
    const batchId=String(batch.id);
    const rows:string[]=[];const params:any[]=[];
    staged.forEach((x:any,i:number)=>{const b=i*6;rows.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},'pending',NOW(),NOW())`);params.push(batchId,x[0],x[1],x[2],x[3],x[4]);});
    if(rows.length)await c.query(`INSERT INTO "SmsRecipient" ("batchId",phone,"operatorId",rate,cost,parts,status,"createdAt","updatedAt") VALUES ${rows.join(',')}`,params);
    const after=before.sub(total);
    await c.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after.toFixed(6),userIdBigInt.toString()]);
    await c.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,\'debit\',$3,$4,$5,NOW())',[userIdBigInt.toString(),total.toFixed(6),before.toFixed(6),after.toFixed(6),'SMS batch '+batchExternal]);
    await c.query('UPDATE "Batch" SET status=\'queued\',"updatedAt"=NOW() WHERE id=$1',[batchId]);
    await c.query('INSERT INTO "OutboxEvent" ("aggregateType","aggregateId","eventType",payload,"createdAt") VALUES (\'batch\',$1,\'sms.plan\',$2,NOW())',[batchExternal,JSON.stringify({batchId:batchExternal})]);
  });
  // Planning event is written transactionally to the outbox.
  return {status:'accepted',provider:'InfoZillion',batchId:batchExternal,recipients:recipients.length};
 }
}
