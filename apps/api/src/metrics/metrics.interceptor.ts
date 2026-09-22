import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { httpRequests, apiLatency } from './metrics';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
 intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  const req=context.switchToHttp().getRequest();
  const res=context.switchToHttp().getResponse();
  const start=process.hrtime.bigint();
  return next.handle().pipe(finalize(()=>{
   const route=req.route?.path || req.path || 'unknown';
   const method=String(req.method||'UNKNOWN');
   const status=String(res.statusCode||500);
   const seconds=Number(process.hrtime.bigint()-start)/1e9;
   httpRequests.inc({method,route,status});
   apiLatency.observe({method,route},seconds);
  }));
 }
}
