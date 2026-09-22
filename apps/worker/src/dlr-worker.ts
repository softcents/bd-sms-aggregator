import 'dotenv/config';
import {db,markDelivered,markFailedAndRefund} from './db';
import {fetchDlr} from './dlr';

function statusOf(d:any){
  const raw=String(d.deliveryStatus??d.a2pDeliveryStatus??'').toLowerCase();
  const http=String(d.ansSendSmsHttpStatus??'').toLowerCase();
  if(['delivered','delivery_success','success','1','delivered_success'].includes(raw)) return 'delivered';
  if(d.dndMsisdn||d.invalidMsisdn||['failed','failure','rejected','undelivered','error'].includes(raw)||['400','401','403','404','422'].includes(http)) return 'failed';
  return 'sent';
}
function reasonOf(d:any){return d.dndMsisdn?'DND':d.invalidMsisdn?'Invalid MSISDN':String(d.deliveryStatus??d.a2pDeliveryStatus??'InfoZillion DLR failure');}

async function run(){
  const batchSize=Number(process.env.DLR_BATCH_SIZE||100);
  const q=await db.query(`WITH picked AS (
    SELECT id FROM "Message"
    WHERE status='sent' AND "gatewayMessageId" IS NOT NULL AND "nextPollAt"<=NOW()
      AND ("dlrClaimedAt" IS NULL OR "dlrClaimedAt" < NOW()-INTERVAL '2 minutes')
    ORDER BY "nextPollAt" ASC LIMIT $1 FOR UPDATE SKIP LOCKED
  )
  UPDATE "Message" m SET "dlrClaimedAt"=NOW(),"updatedAt"=NOW()
  FROM picked p WHERE m.id=p.id
  RETURNING m.id,m."externalId",m."gatewayMessageId",m.to,m."pollAttempt"`,[batchSize]);
  for(const m of q.rows){
    try{
      const data=await fetchDlr({recipient:m.to,gatewayMessageId:m.gatewayMessageId});
      const st=statusOf(data);
      if(st==='delivered') await markDelivered(m.externalId,data);
      else if(st==='failed') await markFailedAndRefund(m.externalId,reasonOf(data),data);
      else{
        const attempt=Number(m.pollAttempt)+1,delay=Math.min(3600,30*Math.pow(2,Math.min(attempt,6)));
        await db.query('UPDATE "Message" SET "pollAttempt"=$1,"nextPollAt"=NOW()+($2 * INTERVAL \'1 second\'),"infozillionReport"=$3,"updatedAt"=NOW() WHERE id=$4',[attempt,delay,JSON.stringify(data),m.id]);
      }
    }catch(e:any){
      const attempt=Number(m.pollAttempt)+1,delay=Math.min(3600,30*Math.pow(2,Math.min(attempt,6)));
      await db.query('UPDATE "Message" SET "pollAttempt"=$1,"nextPollAt"=NOW()+($2 * INTERVAL \'1 second\'),"failedReason"=$3,"updatedAt"=NOW() WHERE id=$4',[attempt,delay,e.message,m.id]);
    }
  }
  setTimeout(()=>run().catch(console.error),Number(process.env.DLR_INTERVAL_MS||10000));
}
run().catch(e=>{console.error(e);process.exit(1)});
