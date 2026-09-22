# BD SMS Aggregator

High-volume Bangladesh SMS platform.

- Frontend: React + TypeScript
- API: NestJS + TypeScript
- Database: PostgreSQL
- Queue: RabbitMQ
- Cache/rate limiting: Redis
- Provider: InfoZillion only
- Deployment: Docker + Nginx
- Observability: Prometheus + Grafana

This repository is rebuilt from a clean baseline. The production Laravel application's business requirements are used as the functional reference, while the runtime architecture is implemented natively in Node.js/TypeScript.
