output "ecr_repositories" {
  description = "Push the backend services image to each API repository and the web image to the web repository."
  value       = { for name, repository in aws_ecr_repository.app : name => repository.repository_url }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.app.name
}

output "application_url" {
  description = "HTTP bootstrap endpoint; configure HTTPS before exposing production traffic."
  value       = var.deploy_enabled ? "http://${aws_lb.app[0].dns_name}" : "Deployment disabled; set deploy_enabled after preparing the VPC and images."
}
