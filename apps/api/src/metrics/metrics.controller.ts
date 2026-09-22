import { Controller, Get, Header } from '@nestjs/common';
import { registry } from './metrics';
@Controller('metrics')
export class MetricsController {
 @Get()
 @Header('Content-Type','text/plain; version=0.0.4')
 async metrics(){return registry.metrics();}
}
