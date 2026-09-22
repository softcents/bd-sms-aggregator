import { Injectable, OnModuleDestroy } from '@nestjs/common';
import amqp, { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = amqp.connect([
    process.env.RABBITMQ_URL || 'amqp://sms:sms@rabbitmq:5672',
  ]);

  private readonly channel: ChannelWrapper = this.connection.createChannel({
    setup: async (channel: ConfirmChannel) => {
      await channel.assertExchange('sms', 'topic', { durable: true });
      await channel.assertQueue('sms.infozillion', { durable: true });
      await channel.bindQueue('sms.infozillion', 'sms', 'send.infozillion');
    },
  });

  async publishInfozillion(payload: Record<string, unknown>): Promise<void> {
    await this.channel.publish(
      'sms',
      'send.infozillion',
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json' },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
  }
}
