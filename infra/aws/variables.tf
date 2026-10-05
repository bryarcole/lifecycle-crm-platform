variable "aws_region" {
  description = "AWS region for the example deployment."
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Short lowercase name used for AWS resources."
  type        = string
  default     = "lifecycle-crm"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "development"
}

variable "deploy_enabled" {
  description = "Create ECS services and an internet-facing HTTP load balancer. Requires existing VPC networking and pushed images."
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "Existing VPC ID used when deploy_enabled is true."
  type        = string
  default     = ""
}

variable "private_subnet_ids" {
  description = "At least two private subnets with NAT or required VPC endpoints when deploying."
  type        = list(string)
  default     = []
}

variable "public_subnet_ids" {
  description = "At least two public subnets for the application load balancer."
  type        = list(string)
  default     = []
}

variable "allowed_ingress_cidrs" {
  description = "CIDR ranges allowed to reach the bootstrap HTTP load balancer. Restrict this to trusted addresses."
  type        = set(string)
  default     = []
}

variable "image_tag" {
  description = "Tag that has already been pushed to each ECR repository before enabling ECS services."
  type        = string
  default     = "demo"
}

variable "crm_database_secret_arn" {
  description = "Secrets Manager ARN containing the PostgreSQL connection string; required when deploy_enabled is true."
  type        = string
  default     = ""
}

variable "task_cpu" {
  description = "Fargate CPU units per service task."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate memory in MiB per service task."
  type        = number
  default     = 512
}
