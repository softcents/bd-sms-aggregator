# BD SMS Aggregator

Migration of the existing `sms.whiteinfobd.com` Laravel SMS Gateway to a high-throughput TypeScript architecture.

## Provider scope
**InfoZillion only.** Other Laravel SMS drivers are intentionally excluded from the new runtime.

## Stack
- React + TypeScript
- NestJS + TypeScript
- PostgreSQL + Prisma
- RabbitMQ
- Redis
- Nginx
- Docker
- Prometheus/Grafana
- InfoZillion HTTP API

## Flow
React/API client → Nginx → NestJS → RabbitMQ → InfoZillion worker → InfoZillion → DLR/balance services.

## Source preservation
The conversion is based on the existing Laravel application and its migrations/domain behavior. Phase 2 moves the existing customer, sender, batch/message, operator, tariff, routing and wallet concepts into PostgreSQL/NestJS rather than replacing the product with an unrelated application.

## Current status
The repository contains the Phase 1 foundation and Phase 2 queue/auth foundation. It is **not yet a production-complete replacement** until the remaining source models, billing transactions, DLR persistence, admin/customer UI and automated tests are migrated and verified.
