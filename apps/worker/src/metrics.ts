import http from 'http';
import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';
export const registry=new Registry();
collectDefaultMetrics({register:registry});
export const jobsProcessed=new Counter({name:'sms_worker_jobs_processed_total',help:'Worker jobs processed',labelNames:['result'],registers:[registry]});
export const providerRequests=new Counter({name:'sms_worker_provider_requests_total',help:'InfoZillion provider requests',labelNames:['result'],registers:[registry]});
export const queueErrors=new Counter({name:'sms_worker_queue_errors_total',help:'RabbitMQ errors',registers:[registry]});
export const activeJobs=new Gauge({name:'sms_worker_active_jobs',help:'Active worker jobs',registers:[registry]});
export function startMetricsServer(port=Number(process.env.WORKER_METRICS_PORT||9101)){
 http.createServer(async (req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({status:'ok'}));}
  if(req.url==='/metrics'){res.writeHead(200,{'content-type':registry.contentType});return res.end(await registry.metrics());}
  res.writeHead(404);res.end();
 }).listen(port,'0.0.0.0');
}
