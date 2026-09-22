import { Controller,Get,Header } from '@nestjs/common';
const counters:Record<string,number>={http_requests_total:0,sms_accepted_total:0,provider_success_total:0,provider_failure_total:0,dlr_delivered_total:0,dlr_failed_total:0,queue_publish_error_total:0};
@Controller('metrics')
export class MetricsController{
 @Get() @Header('Content-Type','text/plain; version=0.0.4') metrics(){return Object.entries(counters).map(([k,v])=>`# TYPE ${k} counter\n${k} ${v}`).join('\n')+'\n';}
}
export function metricInc(name:keyof typeof counters,value=1){counters[name]+=value;}