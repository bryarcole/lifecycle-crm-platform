locals {
  app_names = {
    for name in ["web", "api-gateway", "crm-service", "marketing-service", "inside-sales-service", "sales-service", "ordering-service", "delivery-service", "retention-service", "automation-service"] :
    name => "${var.project_name}-${name}"
  }
  apps = {
    web = { port = 80, public = true, command = [], environment = { API_GATEWAY_HOST = "${local.app_names["api-gateway"]}:8080" } }
    api-gateway = {
      port = 8080, public = false, command = ["npx", "tsx", "services/api-gateway/src/index.ts"],
      environment = {
        PORT = "8080", CRM_URL = "http://${local.app_names["crm-service"]}:4000",
        MARKETING_URL = "http://${local.app_names["marketing-service"]}:4101", INSIDE_SALES_URL = "http://${local.app_names["inside-sales-service"]}:4102",
        SALES_URL = "http://${local.app_names["sales-service"]}:4103", ORDERING_URL = "http://${local.app_names["ordering-service"]}:4104",
        DELIVERY_URL = "http://${local.app_names["delivery-service"]}:4105", RETENTION_URL = "http://${local.app_names["retention-service"]}:4106"
      }
    }
    crm-service = { port = 4000, public = false, command = ["npx", "tsx", "services/crm-service/src/index.ts"], environment = { PORT = "4000" } }
    marketing-service = { port = 4101, public = false, command = ["npx", "tsx", "services/department-service/src/index.ts"], environment = { DEPARTMENT = "marketing", PORT = "4101", CRM_URL = "http://${local.app_names["crm-service"]}:4000" } }
    inside-sales-service = { port = 4102, public = false, command = ["npx", "tsx", "services/department-service/src/index.ts"], environment = { DEPARTMENT = "inside-sales", PORT = "4102", CRM_URL = "http://${local.app_names["crm-service"]}:4000" } }
    sales-service = { port = 4103, public = false, command = ["npx", "tsx", "services/department-service/src/index.ts"], environment = { DEPARTMENT = "sales", PORT = "4103", CRM_URL = "http://${local.app_names["crm-service"]}:4000" } }
    ordering-service = { port = 4104, public = false, command = ["npx", "tsx", "services/department-service/src/index.ts"], environment = { DEPARTMENT = "ordering", PORT = "4104", CRM_URL = "http://${local.app_names["crm-service"]}:4000" } }
    delivery-service = { port = 4105, public = false, command = ["npx", "tsx", "services/department-service/src/index.ts"], environment = { DEPARTMENT = "delivery", PORT = "4105", CRM_URL = "http://${local.app_names["crm-service"]}:4000" } }
    retention-service = { port = 4106, public = false, command = ["npx", "tsx", "services/department-service/src/index.ts"], environment = { DEPARTMENT = "retention", PORT = "4106", CRM_URL = "http://${local.app_names["crm-service"]}:4000" } }
    automation-service = { port = 4200, public = false, command = ["npx", "tsx", "services/automation-service/src/index.ts"], environment = { PORT = "4200", DATABASE_URL = "" } }
  }
}

resource "azurerm_resource_group" "app" {
  name     = var.resource_group_name
  location = var.location
  tags     = { application = var.project_name, environment = var.environment }
}

resource "azurerm_log_analytics_workspace" "app" {
  count               = var.deploy_enabled ? 1 : 0
  name                = "${var.project_name}-${var.environment}-logs"
  location            = azurerm_resource_group.app.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "app" {
  count                      = var.deploy_enabled ? 1 : 0
  name                       = "${var.project_name}-${var.environment}-env"
  location                   = azurerm_resource_group.app.location
  resource_group_name        = azurerm_resource_group.app.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app[0].id
  tags                       = { application = var.project_name, environment = var.environment }
}

resource "azurerm_container_app" "app" {
  for_each                     = var.deploy_enabled ? local.apps : {}
  name                         = local.app_names[each.key]
  container_app_environment_id = azurerm_container_app_environment.app[0].id
  resource_group_name          = azurerm_resource_group.app.name
  revision_mode                = "Single"
  tags                         = { application = var.project_name, environment = var.environment, component = each.key }

  dynamic "secret" {
    for_each = contains(["crm-service", "automation-service"], each.key) ? [1] : []
    content {
      name  = "database-url"
      value = var.database_url
    }
  }

  template {
    min_replicas = 0
    max_replicas = 2
    container {
      name   = each.key
      image  = each.key == "web" ? var.web_image : var.api_image
      cpu    = 0.25
      memory = "0.5Gi"
      command = each.value.command

      dynamic "env" {
        for_each = each.value.environment
        content {
          name        = env.key
          value       = env.key == "DATABASE_URL" ? null : env.value
          secret_name = env.key == "DATABASE_URL" ? "database-url" : null
        }
      }
    }
  }

  ingress {
    external_enabled           = each.value.public
    target_port                = each.value.port
    allow_insecure_connections = false
    transport                  = "auto"
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
  depends_on = [azurerm_container_app_environment.app]
}
