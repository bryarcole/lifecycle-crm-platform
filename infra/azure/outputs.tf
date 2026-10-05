output "resource_group_name" {
  value = azurerm_resource_group.app.name
}

output "web_url" {
  description = "Public Container Apps URL for the frontend when deployment is enabled."
  value       = var.deploy_enabled ? "https://${azurerm_container_app.app["web"].ingress[0].fqdn}" : "Deployment disabled; publish the API and web images first."
}
