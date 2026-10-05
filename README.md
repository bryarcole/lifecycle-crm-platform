# Continuum CRM: customer lifecycle demo

This starter implements the supplied **Lifecycle Enterprise CRM Platform** design as a small, runnable reference application. It follows one customer from marketing intake through qualification, sales, order processing, delivery, and retention. Every department works with the same CRM customer profile.

The project is intended for learning and architecture discussion. It is not a production CRM or a production-ready cloud deployment.

## Industry-scale demo data

The CRM can be populated with exactly 25,000 fictional company accounts based on published U.S. Census firm counts and annual receipts-size bands for furniture retailers (including mattress stores) and mattress manufacturers. The source distribution is visible in the **Account revenue distribution** dashboard panel. The records are synthetic; all email addresses use the reserved `.example` domain. Details, source links, assumptions, and caveats are in [docs/customer-data.md](docs/customer-data.md).

The seed command replaces customers in its target database and cascades removal to their events, orders, notifications, and outbox messages. Use it only against a disposable demo database:

```sh
DATABASE_URL='postgres://crm_app:local_only_change_me@localhost:5432/lifecycle_crm' npm run seed:customers -- --count=25000 --reset
```

## Run it locally

### Prerequisites

- Docker Desktop with Docker Compose v2
- A browser

### Start the application

From the repository root:

```sh
cp .env.example .env
```

The sample password is for local development only. Then start the stack:

```sh
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The frontend, API gateway, CRM, six department services, automation worker, and PostgreSQL database start together. The first start builds the images and may take a few minutes.

The default first run includes six walkthrough profiles. To replace them with the 25,000 synthetic industry profiles, run this in a second terminal while the stack is up:

```sh
docker compose --profile seed run --rm customer-seed
```

This profile resets all customer-owned demo rows before it loads the Census-based accounts. Do not run it against a database containing data you need to retain.

To stop the stack, press Ctrl+C and run:

```sh
docker compose down
```

Customer records persist in a local Docker volume. To remove the database and all demo data as well, run `docker compose down -v`.

### Walk through the lifecycle

1. In **Marketing**, use **Capture lead** to create a profile or select the sample lead. Mark it engaged.
2. Open **Inside sales** and qualify the warm lead.
3. Open **Actual sales** and close the opportunity as won.
4. In **Ordering**, create an order ticket.
5. In **Delivering**, confirm delivery.
6. In **Account retention**, start a renewal or create a cross-sell lead. The cross-sell returns to Marketing.

Each action updates the central customer record, appends an audit event, and writes an outbox message in the same database transaction. The automation worker consumes outbox messages and creates department handoff notifications. The department queue is driven by the profile's lifecycle stage.

## Architecture

```mermaid
flowchart LR
    Browser[Browser] --> Web[React web app]
    Web -->|REST| Gateway[API gateway]
    Gateway --> Marketing[Marketing service]
    Gateway --> InsideSales[Inside sales service]
    Gateway --> Sales[Sales service]
    Gateway --> Ordering[Ordering service]
    Gateway --> Delivery[Delivery service]
    Gateway --> Retention[Retention service]
    Gateway --> CRM[CRM system of record]
    Marketing -->|workflow command| CRM
    InsideSales -->|workflow command| CRM
    Sales -->|workflow command| CRM
    Ordering -->|workflow command| CRM
    Delivery -->|workflow command| CRM
    Retention -->|workflow command| CRM
    CRM -->|customer, orders, events| PostgreSQL[(PostgreSQL)]
    CRM -->|transactional outbox| Outbox[(PostgreSQL outbox)]
    Outbox --> Automation[Automation worker]
    Automation -->|handoff notifications| PostgreSQL
```

### Services

| Component | Responsibility | Local port |
| --- | --- | ---: |
| Web | React + Vite lifecycle workspace; served by Nginx in Docker | 3000 |
| API gateway | Single browser-facing REST entry point; routes department and CRM requests | 8080 |
| CRM service | Owns customer profiles, lifecycle transitions, orders, audit events, and outbox records | Internal 4000 |
| Marketing service | Lead capture and engagement handoff | Internal 4101 |
| Inside sales service | Qualification and disqualification | Internal 4102 |
| Actual sales service | Won/lost opportunity decisions | Internal 4103 |
| Ordering service | Creates order tickets for closed-won or renewal opportunities | Internal 4104 |
| Delivery service | Confirms fulfillment and delivery | Internal 4105 |
| Retention service | Starts renewals or routes cross-sell leads back to Marketing | Internal 4106 |
| Automation service | Polls the transactional outbox and creates durable department notifications | Internal 4200 |
| PostgreSQL | Demo system-of-record database and automation outbox | Internal 5432 |

The six department containers use one parameterized service implementation, independently configured and deployed. The CRM service alone changes customer lifecycle records. Department services submit commands to the CRM API; they do not connect to the database. This matches the supplied front-heavy CRM design, though a shared central data store is a deliberate trade-off from the usual database-per-microservice pattern.

### Lifecycle state transitions

| Department | Queue stage | Example action | Next stage |
| --- | --- | --- | --- |
| Marketing | New lead | Mark engaged | Warm lead |
| Inside sales | Warm lead | Qualify | Qualified |
| Actual sales | Qualified | Close won | Closed won |
| Ordering | Closed won or renewal due | Create order | Awaiting delivery |
| Delivering | Awaiting delivery | Confirm delivery | Active customer |
| Account retention | Active customer | Start renewal | Renewal due |
| Account retention | Active customer | Create cross-sell lead | New lead |

The CRM validates the department and current state for each transition. Invalid or out-of-order commands return an error instead of silently skipping a handoff.

## API quick reference

All browser/API traffic goes through the gateway. Department services and CRM are not published to the host in the local Compose setup.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Customer list, order list, stage counts, and historical funnel counts |
| `GET` | `/api/events` | Recent lifecycle audit history |
| `GET` | `/api/notifications` | Notifications produced by the automation worker |
| `GET` | `/api/{department}/queue` | Queue for marketing, inside-sales, sales, ordering, delivery, or retention |
| `POST` | `/api/{department}/actions` | Capture a lead or perform an allowed lifecycle action |
| `GET` | `/health` | API gateway health check |

For example, `POST /api/marketing/actions` with `{"action":"capture_lead","name":"Sam Rivera","email":"sam@example.com","company":"Example Co","campaign":"Spring launch","estimatedValue":12000}` creates a new CRM profile. Department actions use an `action` and `customerId`, such as `{"action":"qualify","customerId":"<profile-id>"}`.

## Run checks without Docker

Requirements: Node.js 22 or newer and a running PostgreSQL 16 database. Set `DATABASE_URL` for the CRM and automation services. Install the root and web dependencies, then run checks:

```sh
npm install
npm --prefix apps/web install
npm test
npm run check
npm run build:web
```

For a fully connected local environment, Docker Compose is the recommended route because it supplies PostgreSQL, service discovery, and all API services.

## Preliminary cloud infrastructure

Pushing source code to GitHub does not run the CRM. GitHub Pages can only host a static frontend and cannot host this project's API, background worker, or PostgreSQL database. Use the included AWS or Azure container infrastructure for an actual client-accessible deployment; configure TLS, identity/RBAC, secrets, database networking, and a reviewed budget before exposing it.

Terraform examples are provided for both **AWS** and **Azure**. They are intentionally disabled by default; planning/applying them with defaults does not launch application compute. Review each cloud folder's README before enabling deployment.

- AWS: ECR repositories for one backend image and one web image, ECS/Fargate task definitions and services, Service Connect discovery, CloudWatch log groups, and an HTTP Application Load Balancer. Existing VPC/subnets and a Secrets Manager database secret are required to deploy.
- Azure: a resource group, Log Analytics workspace, and Azure Container Apps for the frontend and services. Only the web app is externally exposed; application services use internal ingress. Published API/web images and a PostgreSQL connection string are required to deploy.
- Neither example creates a managed PostgreSQL server. Use a managed PostgreSQL offering in a private network and pass its connection string through the cloud secret service. The Azure example currently accepts the connection string as a sensitive Terraform variable; Terraform state must therefore be encrypted and access-controlled.
- The AWS HTTP listener is a bootstrap only. Add TLS with an ACM certificate, HTTPS listener, DNS, WAF/rate limiting, alarms, autoscaling policies, and private network endpoints before any production exposure.
- Cloud cost depends on region, network egress, logs, database sizing, and replica count. Keep `deploy_enabled = false` until images, networking, secrets, and an estimated budget are ready.

See [infra/aws/README.md](infra/aws/README.md) and [infra/azure/README.md](infra/azure/README.md) for setup sequence and required variables.

## Security, scaling, and production gaps

This is a lower-level design example, not a secure production implementation. In particular:

- Department navigation is presentation-only. Add OIDC/SSO, API authorization, and server-enforced RBAC for the six roles.
- Replace the local Compose password and protect all credentials in a managed secret store. Do not commit `.env` or Terraform state.
- The demo uses one central CRM database because the source design requires one CRM system of record. Only CRM owns customer/lifecycle writes; the worker owns generated handoff notifications. For stronger domain boundaries, split schemas gradually and retain a public CRM API.
- The automation worker uses PostgreSQL `FOR UPDATE SKIP LOCKED` polling as a minimal outbox consumer. Add retry/backoff, poison-message handling, observability, and a managed broker (for example, SQS/EventBridge or Azure Service Bus) if throughput or delivery guarantees require it.
- Lead/order amounts, campaigns, and fulfillment are illustrative. Payment, inventory, email, shipping, contract storage, renewal policies, and external APIs are not integrated.
- REST is implemented. GraphQL, comprehensive reporting, audit retention policies, data encryption/key rotation, backups, disaster recovery, rate limits, and load tests are future work.

## Project layout

- `apps/web` — React + TypeScript client and production Nginx image
- `services/api-gateway` — browser-facing routing layer
- `services/crm-service` — CRM API, PostgreSQL schema setup, and lifecycle rules
- `services/department-service` — parameterized implementation for six department containers
- `services/automation-service` — outbox consumer and handoff notification writer
- `db/init.sql` — initial PostgreSQL schema
- `infra/aws` and `infra/azure` — preliminary Terraform deployment examples
- `tests` — lifecycle transition unit tests
- `docs/design-decisions.md` — mapping from the supplied design to this example
