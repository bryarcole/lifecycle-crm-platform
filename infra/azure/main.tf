locals {
  app_names = {
    for name in ["web", "crm-api", "automation-worker"] :
    name => "${var.project_name}-${name}"
  }
  apps = {
    web = {
      port        = 80, public = true, command = null, image_kind = "web",
      environment = { CRM_API_HOST = "${local.app_names["crm-api"]}:8080" }
    }
    crm-api = {
      port        = 8080, public = false, command = ["dotnet", "Lifecycle.Api.dll"], image_kind = "api",
      environment = { ASPNETCORE_URLS = "http://+:8080", ASPNETCORE_ENVIRONMENT = "Production" }
    }
    automation-worker = {
      port        = 8080, public = false, command = ["dotnet", "Lifecycle.Worker.dll"], image_kind = "worker",
      environment = { ASPNETCORE_URLS = "http://+:8080", ASPNETCORE_ENVIRONMENT = "Production" }
    }
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
    for_each = contains(["crm-api", "automation-worker"], each.key) ? [1] : []
    content {
      name  = "database-url"
      value = var.database_url
    }
  }

  template {
    min_replicas = each.key == "automation-worker" ? 1 : 0
    max_replicas = 2
    container {
      name    = each.key
      image   = each.value.image_kind == "web" ? var.web_image : each.value.image_kind == "api" ? var.api_image : var.worker_image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = each.value.command

      dynamic "env" {
        for_each = merge(each.value.environment, contains(["crm-api", "automation-worker"], each.key) ? { "ConnectionStrings__Crm" = "" } : {})
        content {
          name        = env.key
          value       = env.key == "ConnectionStrings__Crm" ? null : env.value
          secret_name = env.key == "ConnectionStrings__Crm" ? "database-url" : null
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
