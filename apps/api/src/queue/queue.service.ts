import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import amqp, { ChannelWrapper } from 'amqp-connection-manager';
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy { private connection:any; private channel!:ChannelWrapper;
 async onModuleInit(){this.connection=amqp.connect([process.env.RABBITMQ_URL||'amqp://sms:sms@localhost:5672']);this.channel=this.connection.createChannel({json:true,setup:async ch=>{await ch.assertExchange('sms','topic',{durable:true});await ch.assertQueue('sms.infozillion',{durable:true});await ch.bindQueue('sms.infozillion','sms','send.infozillion')}})}
 async publishInfozillion(job:Record<string,unknown>){await this.channel.publish('sms','send.infozillion',job,{persistent:true,contentType:'application/json'})}
 async onModuleDestroy(){await this.connection?.close()}}
