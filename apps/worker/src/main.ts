import 'dotenv/config';
import amqp, { ChannelWrapper } from 'amqp-connection-manager';
import { claimForSending, markSent, markFailedAndRefund, resetForRetry } from './db';
import { startMetricsServer, jobsProcessed, providerRequests, activeJobs, rabbitConnected } from './metrics';

const base=(process.env.INFOZILLION_BASE_URL||'https://api.mnpspbd.com').replace(/\/$/,'');
function endpoint(){return process.env.INFOZILLION_API_TYPE==='mno'?base+'/a2p-sms/api/v1/send-sms':base+'/a2p-sms-iptsp/api/v1/send-sms'}

async function send(job:any){
 providerRequests.inc({result:'attempt'});
 const cli=String(job.senderId||process.env.INFOZILLION_CLI||'').trim();
 const digits=cli.replace(/\D/g,'');
 const normalized=digits?(digits.startsWith('0')?'880'+digits.slice(1):digits.startsWith('880')?digits:'880'+digits):cli;
 const bill=/^\d+$/.test(normalized)?normalized:(process.env.INFOZILLION_BILL_MSISDN||'');
 const payload={username:process.env.INFOZILLION_USERNAME||'',password:process.env.INFOZILLION_PASSWORD||'',billMsisdn:bill,usernameSecondary:'',passwordSecondary:'',billMsisdnSecondary:'',apiKey:process.env.INFOZILLION_API_KEY||'',cli,msisdnList:(job.to||[]).map((x:string)=>x.replace(/^\+/,'')),transactionType:'T',messageType:job.isUnicode?'3':'1',isLongSMS:job.isLongSMS??String(job.body||'').length>160,message:job.body||''};
 const res=await fetch(endpoint(),{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(Number(process.env.INFOZILLION_TIMEOUT_MS||10000))});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||String(data.serverResponseCode)!=='9000'){providerRequests.inc({result:'failure'});throw new Error(data.serverResponseMessage||('InfoZillion HTTP '+res.status))}
 providerRequests.inc({result:'success'});return data;
}

async function main(){
 startMetricsServer();
 const conn=amqp.connect([process.env.RABBITMQ_URL||'amqp://sms:sms@rabbitmq:5672'],{heartbeatIntervalInSeconds:10,reconnectTimeInSeconds:5});
 conn.on('connect',()=>rabbitConnected.set(1));
 conn.on('disconnect',()=>rabbitConnected.set(0));
 const ch=conn.createChannel({json:false,setup:async (channel)=>{
  await channel.assertExchange('sms','topic',{durable:true});
  await channel.assertExchange('sms.dlx','topic',{durable:true});
  await channel.assertQueue('sms.infozillion',{durable:true,deadLetterExchange:'sms.dlx'});
  await channel.bindQueue('sms.infozillion','sms','send.infozillion');
  await channel.assertQueue('sms.retry.1',{durable:true,messageTtl:5000,deadLetterExchange:'sms',deadLetterRoutingKey:'send.infozillion'});
  await channel.assertQueue('sms.retry.2',{durable:true,messageTtl:15000,deadLetterExchange:'sms',deadLetterRoutingKey:'send.infozillion'});
  await channel.bindQueue('sms.retry.1','sms','retry.1');
  await channel.bindQueue('sms.retry.2','sms','retry.2');
  await channel.prefetch(Number(process.env.WORKER_PREFETCH||50));
 }});
 await ch.waitForConnect();
 console.log('InfoZillion worker ready');
 await ch.consume('sms.infozillion',async m=>{
  if(!m)return;
  activeJobs.inc();
  try{
   const job=JSON.parse(m.content.toString());
   if(job.messageId && !(await claimForSending(String(job.messageId)))){await ch.ack(m);jobsProcessed.inc({result:'duplicate'});return;}
   const result=await send(job);
   if(job.messageId)await markSent(String(job.messageId),String(result.serverTxnId||''),result);
   jobsProcessed.inc({result:'success'});await ch.ack(m);
  }catch(e:any){
   try{
    const retry=Number(m.properties.headers?.['x-retry']||0);
    if(retry<2){
     const body=m.content;
     const h={...(m.properties.headers||{}),'x-retry':retry+1};
     const job=JSON.parse(body.toString());
     if(job.messageId)await resetForRetry(String(job.messageId));
     await ch.publish('sms',`retry.${retry+1}`,body,{persistent:true,headers:h});
     jobsProcessed.inc({result:'retry'});await ch.ack(m);
    }else{
     const job=JSON.parse(m.content.toString());
     if(job.messageId)await markFailedAndRefund(String(job.messageId),e.message,{});
     jobsProcessed.inc({result:'failed'});await ch.nack(m,false,false);
    }
   }catch(err){jobsProcessed.inc({result:'error'});await ch.nack(m,false,true)}
  }finally{activeJobs.dec();}
 });
 const shutdown=async()=>{rabbitConnected.set(0);await ch.close().catch(()=>{});await conn.close().catch(()=>{});process.exit(0)};
 process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
main().catch(e=>{console.error(e);process.exit(1)});
