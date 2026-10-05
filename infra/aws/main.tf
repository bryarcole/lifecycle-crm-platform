locals {
  image_names = toset(["api", "web"])
  apps = {
    web = {
      port = 80
      command = null
      environment = { API_GATEWAY_HOST = "api-gateway:8080" }
      image_kind = "web"
    }
    api-gateway = {
      port = 8080
      command = ["npx", "tsx", "services/api-gateway/src/index.ts"]
      image_kind = "api"
      environment = {
        PORT = "8080", CRM_URL = "http://crm-service:4000",
        MARKETING_URL = "http://marketing-service:4101", INSIDE_SALES_URL = "http://inside-sales-service:4102",
        SALES_URL = "http://sales-service:4103", ORDERING_URL = "http://ordering-service:4104",
        DELIVERY_URL = "http://delivery-service:4105", RETENTION_URL = "http://retention-service:4106"
      }
    }
    crm-service = {
      port = 4000
      command = ["npx", "tsx", "services/crm-service/src/index.ts"]
      image_kind = "api"
      environment = { PORT = "4000" }
    }
    marketing-service = { port = 4101, command = ["npx", "tsx", "services/department-service/src/index.ts"], image_kind = "api", environment = { DEPARTMENT = "marketing", PORT = "4101", CRM_URL = "http://crm-service:4000" } }
    inside-sales-service = { port = 4102, command = ["npx", "tsx", "services/department-service/src/index.ts"], image_kind = "api", environment = { DEPARTMENT = "inside-sales", PORT = "4102", CRM_URL = "http://crm-service:4000" } }
    sales-service = { port = 4103, command = ["npx", "tsx", "services/department-service/src/index.ts"], image_kind = "api", environment = { DEPARTMENT = "sales", PORT = "4103", CRM_URL = "http://crm-service:4000" } }
    ordering-service = { port = 4104, command = ["npx", "tsx", "services/department-service/src/index.ts"], image_kind = "api", environment = { DEPARTMENT = "ordering", PORT = "4104", CRM_URL = "http://crm-service:4000" } }
    delivery-service = { port = 4105, command = ["npx", "tsx", "services/department-service/src/index.ts"], image_kind = "api", environment = { DEPARTMENT = "delivery", PORT = "4105", CRM_URL = "http://crm-service:4000" } }
    retention-service = { port = 4106, command = ["npx", "tsx", "services/department-service/src/index.ts"], image_kind = "api", environment = { DEPARTMENT = "retention", PORT = "4106", CRM_URL = "http://crm-service:4000" } }
    automation-service = { port = 4200, command = ["npx", "tsx", "services/automation-service/src/index.ts"], image_kind = "api", environment = { PORT = "4200" } }
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
    Version = "2012-10-17"
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
    Version = "2012-10-17"
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
  container_definitions = jsonencode([{
    name      = each.key
    image     = "${aws_ecr_repository.app[each.value.image_kind].repository_url}:${var.image_tag}"
    essential = true
    command   = each.value.command == null ? [] : each.value.command
    portMappings = [{ name = "http", containerPort = each.value.port, hostPort = each.value.port, protocol = "tcp" }]
    environment = [for name, value in each.value.environment : { name = name, value = value }]
    secrets = contains(["crm-service", "automation-service"], each.key) ? [{ name = "DATABASE_URL", valueFrom = var.crm_database_secret_arn }] : []
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "container"
      }
    }
  }])
  depends_on = [aws_iam_role_policy_attachment.task_execution, aws_iam_role_policy.database_secret]
}

resource "aws_ecs_service" "app" {
  for_each        = var.deploy_enabled ? local.apps : {}
  name            = "${var.project_name}-${each.key}"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app[each.key].arn
  desired_count   = 1
  launch_type     = "FARGATE"
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
