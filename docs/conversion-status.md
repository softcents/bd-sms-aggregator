# SMS WhiteInfo → NestJS/React conversion

Scope: **existing Laravel project converted to TypeScript architecture; InfoZillion only**.

## Completed foundation
- React + TypeScript frontend shell
- NestJS API
- PostgreSQL/Prisma domain schema
- RabbitMQ producer/worker foundation
- Redis infrastructure
- Nginx infrastructure
- Prometheus configuration
- API-key protection foundation
- InfoZillion single/bulk endpoint adapter
- InfoZillion IPTSP/MNO endpoint selection
- InfoZillion success code 9000
- Billing atomic debit service using PostgreSQL serializable transactions
- Tariff/operator/route domain models
- Routing service foundation
- Health endpoint

## Remaining migration
- Complete all 71 source migrations into PostgreSQL where required.
- Persist queued/sent/delivered/failed message state.
- Full InfoZillion DLR polling and report persistence.
- Operator detection and exact tariff calculation.
- Campaign/contact/group/import/export/template modules.
- Admin/customer/reseller React screens.
- Full RBAC and per-customer API keys.
- Automated unit/integration/load tests.
- Production Docker images and deployment validation.

The repository is not yet declared production-ready until those items are implemented and tested.
