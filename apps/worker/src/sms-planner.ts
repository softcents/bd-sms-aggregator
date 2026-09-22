import 'dotenv/config';
import amqp from 'amqp-connection-manager';
import crypto from 'crypto';
import { db } from './db';

async function plan(batchExternalId:string){
 const c=await db.connect();
 try{
  await c.query('BEGIN');
  const bq=await c.query(`SELECT b.id,b."externalId",b."userId",b."senderId",b.body,s."senderId" AS "senderLabel",s.type,s."billMsisdn"
    FROM "Batch" b JOIN "Sender" s ON s.id=b."senderId"
    WHERE b."externalId"=$1 AND b.status NOT IN ('paused','cancelled') FOR UPDATE`,[batchExternalId]);
  if(!bq.rowCount){await c.query('ROLLBACK');return false}
  const b=bq.rows[0];
  const rows=(await c.query(`SELECT id,phone,parts,rate,cost FROM "SmsRecipient"
    WHERE "batchId"=$1 AND status='pending' ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,[b.id,Number(process.env.SMS_PLAN_CHUNK_SIZE||1000)])).rows;
  if(!rows.length){
   const active=(await c.query(`SELECT 1 FROM "Message" WHERE "batchId"=$1 AND status IN ('queued','sending') LIMIT 1`,[b.id])).rowCount;
   if(!active)await c.query(`UPDATE "Batch" SET status='completed',"startedAt"=COALESCE("startedAt",NOW()),"completedAt"=COALESCE("completedAt",NOW()),"updatedAt"=NOW() WHERE id=$1 AND status IN ('queued','processing')`,[b.id]);
   await c.query('COMMIT');return false;
  }
  await c.query(`UPDATE "Batch" SET status='processing',"startedAt"=COALESCE("startedAt",NOW()),"updatedAt"=NOW() WHERE id=$1 AND status='queued'`,[b.id]);
  for(const r of rows){
   const mid=crypto.randomUUID();
   const unicode=/[^\x00-\x7F]/.test(b.body);
   await c.query(`INSERT INTO "Message" ("externalId","userId","batchId","senderId",to,body,status,source,"isUnicode",parts,rate,cost,"createdAt","updatedAt")
    VALUES ($1,$2,$3,$4,$5,$6,'queued','api',$7,$8,$9,$10,NOW(),NOW())`,[mid,b.userId,b.id,b.senderId,r.phone,b.body,unicode,r.parts,r.rate,r.cost]);
   const payload={id:crypto.randomUUID(),messageId:mid,batchId:String(b.id),provider:'InfoZillion',senderId:b.senderLabel,senderType:b.type,billMsisdn:b.billMsisdn||null,to:[r.phone],body:b.body,isUnicode:unicode,isLongSMS:Number(r.parts)>1};
   await c.query(`INSERT INTO "OutboxEvent" ("aggregateType","aggregateId","eventType",payload,"createdAt") VALUES ('message',$1,'sms.infozillion',$2,NOW())`,[mid,JSON.stringify(payload)]);
   await c.query(`UPDATE "SmsRecipient" SET status='planned',"messageId"=$1,"updatedAt"=NOW() WHERE id=$2`,[mid,r.id]);
  }
  await c.query('COMMIT');return true;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
async function main(){
 const conn=amqp.connect([process.env.RABBITMQ_URL||'amqp://sms:sms@rabbitmq:5672'],{heartbeatIntervalInSeconds:10,reconnectTimeInSeconds:5});
 const ch=conn.createChannel({json:true,setup:async channel=>{await channel.assertExchange('sms','topic',{durable:true});await channel.assertQueue('sms.plan',{durable:true});await channel.bindQueue('sms.plan','sms','sms.plan');await channel.prefetch(Number(process.env.SMS_PLAN_PREFETCH||2));}});
 await ch.waitForConnect();console.log('SMS planner ready');
 await ch.consume('sms.plan',async m=>{if(!m)return;try{const j=JSON.parse(m.content.toString());const more=await plan(String(j.batchId));if(more)await ch.publish('sms','sms.plan',j,{persistent:true});await ch.ack(m)}catch(e){console.error('SMS planner failed',e);await ch.nack(m,false,true)}});
}
main().catch(e=>{console.error(e);process.exit(1)});
