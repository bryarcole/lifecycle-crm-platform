# AWS deployment example

This Terraform stack is a preliminary ECS/Fargate landing zone for the demo. `deploy_enabled` defaults to `false`: the first apply creates ECR repositories for the web app, .NET API, and .NET worker, an ECS cluster, execution role, logs, and a Service Connect namespace, but does not launch application tasks or a load balancer. ECR storage and Cloud Map operations can still incur charges. Review AWS pricing for the chosen region before applying.

## Prerequisites

- Terraform 1.6 or newer
- AWS CLI authenticated to the target account and region
- An existing VPC with at least two public and two private subnets
- Private-subnet outbound access through NAT or the required VPC endpoints for ECR, S3, CloudWatch Logs, and Secrets Manager
- An externally provisioned PostgreSQL database reachable from the private task subnets

The Terraform does not create VPC networking or PostgreSQL. That avoids silently creating a large, billable baseline and lets an organization use its existing network and database controls.

## Bootstrap the image repositories

From this folder, initialize and inspect the safe default plan:

```sh
terraform init
terraform plan
terraform apply
```

The output `ecr_repositories` contains the `api`, `worker`, and `web` repository URLs. Build the C# API and worker images from `../../Dockerfile.dotnet`, setting `PROJECT` to `src/Lifecycle.Api/Lifecycle.Api.csproj` or `src/Lifecycle.Worker/Lifecycle.Worker.csproj`, respectively. Build the frontend image from `../../apps/web/Dockerfile`. Push each image to its matching ECR repository with the `demo` tag. Do not enable application compute until all three images are pushed.

Create a Secrets Manager secret whose secret string is the PostgreSQL connection URI. The .NET API and automation-worker tasks receive it at runtime as `ConnectionStrings__Crm` through the ECS task execution role.

## Enable the ECS deployment

Create an uncommitted `terraform.tfvars` file in this directory containing the deployment inputs for your environment:

- `deploy_enabled = true`
- `vpc_id`
- `private_subnet_ids` and `public_subnet_ids`
- `crm_database_secret_arn`
- `allowed_ingress_cidrs` set to a trusted CIDR range for the bootstrap HTTP endpoint

Keep the database URI in Secrets Manager, not in the tfvars file. Plan and inspect every change before applying. The task and service resources deploy one frontend, one CRM API, and one outbox worker. The browser enters through an Application Load Balancer; the frontend reaches the CRM API through ECS Service Connect. Backend tasks do not receive public IP addresses.

The web container proxies `/api` directly to the CRM API over Service Connect; no API gateway or department pass-through tasks are needed. The current listener is HTTP only and the CIDR list defaults to empty, so the endpoint is not externally reachable until a trusted ingress range is configured. Before production, add an ACM certificate and HTTPS listener, DNS, WAF/rate limits, alarms, database subnet groups/private access, backups, autoscaling, and a reviewed task IAM policy. The example uses the standard ECS execution policy and a small fixed task size; right-size and scope these for the target environment.

## Clean up

`terraform destroy` removes resources managed by this state. Confirm impact first. ECR images and Terraform state may need separate retention/backup handling according to your organization policy.
