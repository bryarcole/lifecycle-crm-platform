variable "subscription_id" {
  description = "Azure subscription ID. Can be omitted when the CLI default subscription is configured."
  type        = string
  default     = null
  nullable    = true
}

variable "project_name" {
  description = "Lowercase prefix for Azure resources and internal app names."
  type        = string
  default     = "lifecyclecrm"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,11}$", var.project_name))
    error_message = "Use 3 to 12 lowercase letters, numbers, or hyphens; start with a letter."
  }
}

variable "location" {
  description = "Azure region for the example deployment."
  type        = string
  default     = "West US 2"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "development"
}

variable "deploy_enabled" {
  description = "Create the Log Analytics workspace and Container Apps."
  type        = bool
  default     = false
}

variable "resource_group_name" {
  description = "Resource group that contains the example deployment."
  type        = string
  default     = "rg-lifecycle-crm-demo"
}

variable "api_image" {
  description = "Published .NET CRM API image URI built from Dockerfile.dotnet with PROJECT=src/Lifecycle.Api/Lifecycle.Api.csproj."
  type        = string
  default     = ""
}

variable "worker_image" {
  description = "Published .NET outbox worker image URI built from Dockerfile.dotnet with PROJECT=src/Lifecycle.Worker/Lifecycle.Worker.csproj."
  type        = string
  default     = ""
}

variable "web_image" {
  description = "Published web image URI built from apps/web/Dockerfile."
  type        = string
  default     = ""
}

variable "database_url" {
  description = "PostgreSQL connection string for CRM API and worker. Stored in Terraform state; use protected remote state and a Key Vault reference in production."
  type        = string
  sensitive   = true
  default     = ""
}
