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

 async send(dto:SendSmsDto,userIdHeader?:string){
  if(!userIdHeader)throw new UnauthorizedException('x-user-id is required');
  const userId=BigInt(userIdHeader);
  if(!dto.to?.length)throw new BadRequestException('Recipient list is empty');
  const batchExternal=crypto.randomUUID();
  const unicode=dto.isUnicode??/[\u0080-\uFFFF]/u.test(dto.body);
  const messageParts=parts(dto.body,unicode);
  const recipients=[...new Set(dto.to.map(normalizeMsisdn))];
  const chunkSize=Math.min(Math.max(Number(process.env.SMS_DB_CHUNK_SIZE||1000),100),2000);

  await this.db.tx(async c=>{
   const u=await c.query('SELECT id,status,balance FROM "User" WHERE id=$1 FOR UPDATE',[userId.toString()]);
   if(!u.rowCount||u.rows[0].status!=='active')throw new UnauthorizedException('User is not active');

   let sender:any=null;
   if(/^\d+$/.test(dto.senderId)){
    const q=await c.query('SELECT id,"senderId",type,"billMsisdn" FROM "Sender" WHERE id=$1 AND "userId"=$2 AND status=$3',[dto.senderId,userId.toString(),'active']);
    if(q.rowCount)sender=q.rows[0];
   }else{
    const q=await c.query('SELECT id,"senderId",type,"billMsisdn" FROM "Sender" WHERE "userId"=$1 AND "senderId"=$2 AND status=$3',[userId.toString(),dto.senderId,'active']);
    if(q.rowCount)sender=q.rows[0];
   }
   if(!sender)throw new BadRequestException('Sender not found or inactive');

   // Preload routing data once: no per-recipient N+1 queries.
   const prefixQ=await c.query('SELECT o.id,o.code,p.prefix FROM "OperatorPrefix" p JOIN "Operator" o ON o.id=p."operatorId" WHERE p.enabled=true AND o.enabled=true ORDER BY length(p.prefix) DESC');
   const prefixes=prefixQ.rows;
   const rateQ=await c.query(`SELECT DISTINCT ON (tr."operatorId")
      tr."operatorId",tr."maskingPrice",tr."nonMaskingPrice"
      FROM "TariffRate" tr
      JOIN "TariffPlanAssignment" a ON a."tariffPlanId"=tr."tariffPlanId"
      WHERE a."userId"=$1 AND tr."effectiveFrom"<=NOW() AND a."effectiveFrom"<=NOW()
      ORDER BY tr."operatorId",a."effectiveFrom" DESC,tr."effectiveFrom" DESC`,[userId.toString()]);
   const rates=new Map<string,any>();
   for(const row of rateQ.rows)rates.set(String(row.operatorId),row);

   const senderType=String(sender.type||'').toLowerCase();
   const masking=['masking','alphanumeric','numeric'].includes(senderType);
   const planned:any[]=[];
   let total=new Decimal(0);

   for(const to of recipients){
    const op=prefixes.find((p:any)=>to.startsWith(String(p.prefix)));
    if(!op)throw new BadRequestException('No operator mapping for '+to);
    const rate=rates.get(String(op.id));
    if(!rate)throw new BadRequestException('No tariff rate for operator '+op.code);
    const unit=masking?rate.maskingPrice:rate.nonMaskingPrice;
    const cost=new Decimal(String(unit)).mul(messageParts);
    if(!cost.isFinite()||cost.lte(0))throw new BadRequestException('Invalid SMS tariff');
    total=total.add(cost);
    planned.push({
      externalId:crypto.randomUUID(),
      to,
      unit:String(unit),
      cost:cost.toFixed(6),
      operatorId:String(op.id)
    });
   }

   const before=new Decimal(String(u.rows[0].balance));
   if(before.lt(total))throw new BadRequestException('Insufficient balance');
   const after=before.sub(total);

   const b=await c.query(
    'INSERT INTO "Batch" ("externalId","userId","senderId",body,status,"totalRecipients","validCount","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6,NOW(),NOW()) RETURNING id',
    [batchExternal,userId.toString(),sender.id,dto.body,'queued',planned.length]
   );
   const batchId=String(b.rows[0].id);

   for(let start=0;start<planned.length;start+=chunkSize){
    const chunk=planned.slice(start,start+chunkSize);
    const messageRows=chunk.map((x:any)=>[
      x.externalId,userId.toString(),batchId,sender.id,x.to,dto.body,'queued','api',unicode,messageParts,x.unit,x.cost
    ]);
    const mv=sqlValues(messageRows,12);
    await c.query(
      `INSERT INTO "Message" ("externalId","userId","batchId","senderId",to,body,status,source,"isUnicode",parts,rate,cost,"createdAt","updatedAt")
       VALUES ${mv.sql}`,mv.params
    );

    const outboxRows=chunk.map((x:any)=>[
      'message',x.externalId,'sms.infozillion',JSON.stringify({
        id:crypto.randomUUID(),messageId:x.externalId,batchId,provider:'InfoZillion',
        senderId:sender.senderId,senderType,billMsisdn:sender.billMsisdn||null,
        to:[x.to],body:dto.body,isUnicode:unicode,isLongSMS:messageParts>1,createdAt:new Date().toISOString()
      })
    ]);
    const ov=sqlValues(outboxRows,4);
    await c.query(
      `INSERT INTO "OutboxEvent" ("aggregateType","aggregateId","eventType",payload,"createdAt") VALUES ${ov.sql}`,
      ov.params
    );
   }

   await c.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after.toFixed(6),userId.toString()]);
   await c.query(
    'INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
    [userId.toString(),total.toFixed(6),'debit',before.toFixed(6),after.toFixed(6),'SMS batch '+batchExternal]
   );
  });

  return {status:'accepted',provider:'InfoZillion',batchId:batchExternal,recipients:recipients.length};
 }
}
