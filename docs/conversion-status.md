# SMS WhiteInfo → NestJS/React conversion

Source: sms.whiteinfobd.com.zip

Scope: **InfoZillion only**. Anbernet, ReveSMS and QSMS are excluded.

## Phase 1
- Laravel source audited.
- NestJS API skeleton.
- InfoZillion adapter for single/bulk send, DLR and balance.
- RabbitMQ worker skeleton.
- PostgreSQL/Prisma core schema.
- React frontend shell.
- Docker PostgreSQL/Redis/RabbitMQ infrastructure.

## Preserved InfoZillion behavior
- Success code: 9000.
- IPTSP/MNO endpoint families.
- Single transaction: T.
- Bulk transaction: P.
- Unicode message type: 3.
- serverTxnId used as gateway message ID.
- DLR polling.
- Wallet and carrier credit balance checks.

## Next conversion work
1. Complete Laravel model/migration → PostgreSQL mappings.
2. Convert authentication/RBAC/API tokens.
3. Convert tariff, operator, routing and billing.
4. Put SMS dispatch fully behind RabbitMQ.
5. Convert Admin/Customer/SP interfaces to React.
6. Add integration tests and migration verification.
