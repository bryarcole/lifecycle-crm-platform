locals {
  image_names = toset(["api", "worker", "web"])
  apps = {
    web = {
      port       = 80
      command    = null
      image_kind = "web"
      environment = {
        CRM_API_HOST = "crm-api:8080"
      }
    }
    crm-api = {
      port       = 8080
      command    = ["dotnet", "Lifecycle.Api.dll"]
      image_kind = "api"
      environment = {
        ASPNETCORE_URLS        = "http://+:8080"
        ASPNETCORE_ENVIRONMENT = "Production"
      }
    }
    automation-worker = {
      port       = 8080
      command    = ["dotnet", "Lifecycle.Worker.dll"]
      image_kind = "worker"
      environment = {
        ASPNETCORE_URLS        = "http://+:8080"
        ASPNETCORE_ENVIRONMENT = "Production"
      }
    }
  }
}

resource "aws_ecr_repository" "app" {
  for_each             = local.image_names
  name                 = "${var.project_name}/${each.key}"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecs_cluster" "app" {
  name = "${var.project_name}-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_service_discovery_http_namespace" "internal" {
  name        = "${var.project_name}-${var.environment}"
  description = "Private ECS Service Connect namespace for the lifecycle CRM."
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(keys(local.apps))
  name              = "/ecs/${var.project_name}/${var.environment}/${each.key}"
  retention_in_days = 14
}

resource "aws_iam_role" "task_execution" {
  name = "${var.project_name}-${var.environment}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "database_secret" {
  count = var.deploy_enabled && var.crm_database_secret_arn != "" ? 1 : 0
  name  = "read-crm-database-secret"
  role  = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.crm_database_secret_arn }]
  })
}

resource "aws_security_group" "tasks" {
  count       = var.deploy_enabled ? 1 : 0
  name        = "${var.project_name}-${var.environment}-tasks"
  description = "Private application tasks and Service Connect traffic."
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "service_connect" {
  count                        = var.deploy_enabled ? 1 : 0
  security_group_id            = aws_security_group.tasks[0].id
  referenced_security_group_id = aws_security_group.tasks[0].id
  ip_protocol                  = "tcp"
  from_port                    = 0
  to_port                      = 65535
  description                  = "Allow service-to-service traffic within the ECS task security group."
}

resource "aws_vpc_security_group_egress_rule" "tasks" {
  count             = var.deploy_enabled ? 1 : 0
  security_group_id = aws_security_group.tasks[0].id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Outbound access to configured NAT or VPC endpoints."
}

resource "aws_security_group" "load_balancer" {
  count       = var.deploy_enabled ? 1 : 0
  name        = "${var.project_name}-${var.environment}-alb"
  description = "Bootstrap public HTTP entry point; add HTTPS before production."
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "load_balancer_http" {
  for_each          = var.deploy_enabled ? var.allowed_ingress_cidrs : toset([])
  security_group_id = aws_security_group.load_balancer[0].id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "load_balancer" {
  count                        = var.deploy_enabled ? 1 : 0
  security_group_id            = aws_security_group.load_balancer[0].id
  referenced_security_group_id = aws_security_group.tasks[0].id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_vpc_security_group_ingress_rule" "web_from_alb" {
  count                        = var.deploy_enabled ? 1 : 0
  security_group_id            = aws_security_group.tasks[0].id
  referenced_security_group_id = aws_security_group.load_balancer[0].id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_lb" "app" {
  count              = var.deploy_enabled ? 1 : 0
  name               = substr("${var.project_name}-${var.environment}", 0, 32)
  internal           = false
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.load_balancer[0].id]
}

resource "aws_lb_target_group" "web" {
  count       = var.deploy_enabled ? 1 : 0
  name        = substr("${var.project_name}-${var.environment}-web", 0, 32)
  port        = 80
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check {
    path    = "/"
    matcher = "200-399"
  }
}

resource "aws_lb_listener" "http" {
  count             = var.deploy_enabled ? 1 : 0
  load_balancer_arn = aws_lb.app[0].arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web[0].arn
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each                 = var.deploy_enabled ? local.apps : {}
  family                   = "${var.project_name}-${var.environment}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  container_definitions = jsonencode([merge({
    name         = each.key
    image        = "${aws_ecr_repository.app[each.value.image_kind].repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ name = "http", containerPort = each.value.port, hostPort = each.value.port, protocol = "tcp" }]
    environment  = [for name, value in each.value.environment : { name = name, value = value }]
    secrets      = contains(["crm-api", "automation-worker"], each.key) ? [{ name = "ConnectionStrings__Crm", valueFrom = var.crm_database_secret_arn }] : []
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "container"
      }
    }
  }, each.value.command == null ? {} : { command = each.value.command })])
  depends_on = [aws_iam_role_policy_attachment.task_execution, aws_iam_role_policy.database_secret]
}

resource "aws_ecs_service" "app" {
  for_each         = var.deploy_enabled ? local.apps : {}
  name             = "${var.project_name}-${each.key}"
  cluster          = aws_ecs_cluster.app.id
  task_definition  = aws_ecs_task_definition.app[each.key].arn
  desired_count    = 1
  launch_type      = "FARGATE"
  platform_version = "LATEST"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.tasks[0].id]
    assign_public_ip = false
  }
  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.internal.arn
    service {
      port_name      = "http"
      discovery_name = each.key
      client_alias {
        dns_name = each.key
        port     = each.value.port
      }
    }
  }
  dynamic "load_balancer" {
    for_each = each.key == "web" ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.web[0].arn
      container_name   = "web"
      container_port   = 80
    }
  }
  depends_on = [aws_lb_listener.http]
}
