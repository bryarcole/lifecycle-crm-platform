# Azure deployment example

This Terraform stack maps the frontend and backend containers to Azure Container Apps. `deploy_enabled` defaults to `false`. The default plan creates only the resource group; the Log Analytics workspace, Container Apps environment, and application compute are created only after deployment is explicitly enabled.

## Prerequisites

- Terraform 1.6 or newer
- Azure CLI authenticated to the intended subscription
- An Azure Container Registry or other registry reachable by Container Apps
- Published backend and web images
- A PostgreSQL database reachable from the Container Apps environment

The Terraform does not provision PostgreSQL. Use an approved managed PostgreSQL service and network configuration for the target environment.

## Prepare deployment inputs

Build the backend image from `../../services/Dockerfile` and the frontend image from `../../apps/web/Dockerfile`, then push both to a registry available to Azure. Create a protected remote Terraform state backend before sharing this configuration. The `database_url` variable is marked sensitive but is stored in Terraform state; for production, replace it with a Key Vault secret reference and managed identity access.

Create an uncommitted `terraform.tfvars` file in this folder with:

- `deploy_enabled = true`
- `api_image` set to the published backend image URI
- `web_image` set to the published web image URI
- `database_url` set to the PostgreSQL connection string for this demo deployment
- `location`, `environment`, and `resource_group_name` set for the target

Then initialize, review, and apply:

```sh
az login
terraform init
terraform plan
terraform apply
```

The web app is the only externally exposed Container App and receives HTTPS ingress. The gateway and department/CRM services use internal ingress. The gateway routes to the CRM and department apps by their internal app names; the web container receives the internal API gateway hostname as a runtime setting. Container Apps are configured for scale-to-zero with a maximum of two replicas as a starter setting; production traffic and background processing need explicit scaling rules, minimum replica review, and load testing.

## Production checklist

Configure private connectivity and firewall rules for PostgreSQL, managed identity and Key Vault for secrets, custom domain/TLS policy, WAF/rate limits, health probes, alerts, log retention, backups, database high availability, and per-service CPU/memory/autoscaling based on measured demand. Review the Container Apps and Log Analytics regional costs before enabling deployment.

## Clean up

`terraform destroy` removes resources tracked in this state. Confirm impact before running it and retain state according to the team's recovery policy.
