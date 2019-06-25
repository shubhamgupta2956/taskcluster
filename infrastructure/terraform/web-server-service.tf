module "web_server_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-web-server"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

resource "random_string" "web_server_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "web_server_jwt_key" {
  length = 66
}

module "web_server_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-web-server"
  disabled_services = "${var.disabled_services}"

  secrets = {
    TASKCLUSTER_CLIENT_ID    = "static/taskcluster/web-server"
    TASKCLUSTER_ACCESS_TOKEN = "${random_string.web_server_access_token.result}"
    NODE_ENV                 = "production"
    UI_LOGIN_STRATEGIES      = "${var.ui_login_strategies}"
    PULSE_USERNAME           = "${module.web_server_rabbitmq_user.username}"
    PULSE_PASSWORD           = "${module.web_server_rabbitmq_user.password}"
    PULSE_HOSTNAME           = "${var.rabbitmq_hostname}"
    PULSE_VHOST              = "${var.rabbitmq_vhost}"
    PUBLIC_URL               = "${var.root_url}"
    JWT_KEY                  = "${random_string.web_server_jwt_key.result}"
  }
}

module "web_server_service" {
  source         = "modules/deployment"
  project_name   = "taskcluster-web-server"
  service_name   = "web-server"
  proc_name      = "web"
  readiness_path = "/.well-known/apollo/server-health"
  secret_name    = "${module.web_server_secrets.secret_name}"
  secrets_hash   = "${module.web_server_secrets.secrets_hash}"
  root_url       = "${var.root_url}"
  secret_keys    = "${module.web_server_secrets.env_var_keys}"
  docker_image   = "${local.taskcluster_image_monoimage}"
}

module "web_server_scanner" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-web-server"
  service_name     = "web-server"
  job_name         = "scanner"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.web_server_secrets.secret_name}"
  secrets_hash     = "${module.web_server_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.web_server_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_monoimage}"
}
