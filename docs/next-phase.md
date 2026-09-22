# Next implementation phase

Implemented:
- PostgreSQL message repository for queued/sent/delivered/failed states.
- InfoZillion DLR request helper using the source driver's IPTSP/MNO endpoint families.
- Gateway message ID/report persistence fields in Prisma.

Next integration:
- Connect SMS API to repository and atomic billing transaction.
- Pass message IDs into RabbitMQ jobs.
- Worker persists serverTxnId and schedules DLR polling.
- DLR worker maps dndMsisdn/invalidMsisdn to failed and deliveryStatus/a2pDeliveryStatus to delivered/in-transit.
- Exactly-once compensating refund for failed billable messages.
- Idempotency keys and retry/dead-letter handling.