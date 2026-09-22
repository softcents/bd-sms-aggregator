import { Controller, Get } from '@nestjs/common';
import { PostgresService } from '../db/postgres.service';
import Redis from 'ioredis';
import amqp from 'amqplib';

@Controller('health')
export class HealthController {
 constructor(private readonly db:PostgresService){}
 @Get() check(){return {status:'ok',provider:'InfoZillion',timestamp:new Date().toISOString()};}
 @Get('ready') async ready(){
  const checks:any={postgres:'down',redis:'down',rabbitmq:'down'};
  try{await this.db.pool.query('SELECT 1');checks.postgres='up'}catch{}
  const redis=new Redis(process.env.REDIS_URL||'redis://redis:6379');
  try{await redis.ping();checks.redis='up'}catch{}finally{await redis.quit().catch(()=>{})}
  try{const c=await amqp.connect(process.env.RABBITMQ_URL||'amqp://sms:sms@rabbitmq:5672');await c.close();checks.rabbitmq='up'}catch{}
  const ok=Object.values(checks).every(v=>v==='up');
  return {status:ok?'ready':'not_ready',checks,timestamp:new Date().toISOString()};
 }
}
