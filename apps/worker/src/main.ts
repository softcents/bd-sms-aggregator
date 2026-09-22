import 'dotenv/config';
import amqp, { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

const conn = amqp.connect([
  process.env.RABBITMQ_URL || 'amqp://sms:sms@rabbitmq:5672',
]);

const ch: ChannelWrapper = conn.createChannel({
  setup: async (channel: ConfirmChannel) => {
    await channel.assertExchange('sms', 'topic', { durable: true });
    await channel.assertQueue('sms.infozillion', { durable: true });
    await channel.bindQueue('sms.infozillion', 'sms', 'send.infozillion');
  },
});

async function main() {
  await ch.waitForConnect();
  console.log('InfoZillion worker ready');

  await ch.consume('sms.infozillion', async (m: ConsumeMessage | null) => {
    if (m) {
      ch.ack(m);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
