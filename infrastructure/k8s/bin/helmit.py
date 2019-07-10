#!/usr/bin/env python3

import argparse
import glob
import jsone
import os
import shutil
import yaml

# todo: make things work no matter cwd and os

# secrets are interpolated by json-e into this goland template expression
# "{{ secret | b64enc }}"
# to make this work if a literal, quote it
# if a value being interpoloated by helm, leave it alone
def format_secrets(secrets):
    for key, value in secrets.items():
        if not value.startswith("."):
            secrets[key] = f'"{value}"'


# since non-secrets aren't interpolated into existing template expression
# need to turn them into that
def format_values(context):
    for key, value in context.items():
        if isinstance(value, str) and value.startswith("."):
            context[key] = "{{ " + value + " }}"


def render_rbac(project_name):
    context = {"project_name": project_name}
    for templatetype in ("role", "rolebinding", "serviceaccount"):
        template = yaml.load(
            open(f"templates/{templatetype}.yaml"), Loader=yaml.SafeLoader
        )
        write_file(template, context, templatetype)


def render_secrets(project_name, debug_mode, secrets):
    if debug_mode:
        secrets['debug'] = '*'
        secrets['level'] = 'DEBUG'
    format_secrets(secrets)
    context = {"project_name": project_name, "secrets": secrets}
    template = yaml.load(open("templates/secret.yaml"), Loader=yaml.SafeLoader)
    write_file(template, context, "secrets")


def render_deployment(project_name, deployment):
    context = {
        "project_name": project_name,
        # below are default values
        "volume_mounts": [],
        "readiness_path": "/",
        "proc_name": False,
        "cpu": "50m",
        "memory": "100Mi",
        "replicas": "1",
        "background_job": False,
        "is_monoimage": True,
        # doing this ugly thing here because attempting to do it in jsone turned out even worse
        "checksum_calculation": "{{ " + f'include (print $.Template.BasePath "/{project_name}-secrets.yaml") . | sha256sum' + " }}"
    }
    context.update(deployment)
    format_values(context)
    template = yaml.load(open("templates/deployment.yaml"), Loader=yaml.SafeLoader)
    suffix = (
        f"deployment-{context['proc_name']}" if context["proc_name"] else "deployment"
    )
    write_file(template, context, suffix)
    if not context["background_job"]:
        template = yaml.load(open("templates/service.yaml"), Loader=yaml.SafeLoader)
        write_file(template, context, "service")


def render_cronjob(project_name, deployment):
    context = {
        "project_name": project_name,
        # below are default values
        "volume_mounts": [],
        "is_monoimage": True,
    }
    context.update(deployment)
    format_values(context)
    template = yaml.load(open("templates/cronjob.yaml"), Loader=yaml.SafeLoader)
    suffix = f"cron-{context['job_name'].lower()}"
    write_file(template, context, suffix)


def render_ingress():
    shutil.copy("ingress/ingress.yaml", args.destination)


def write_file(template, context, suffix):
    filepath = f"{args.destination}/{context['project_name']}-{suffix}.yaml"
    try:
        f = open(filepath, "x")
        f.write(yaml.dump(jsone.render(template, context), default_flow_style=False, width=float("inf")))
        f.close()
    except:
        print(f"failed to write {filepath}")


parser = argparse.ArgumentParser()
parser.add_argument("--service", help="Name of the service to render", default=None)
parser.add_argument(
    "--destination", help="Directory to hold helm templates. Created if absent.", default="chart/templates"
)
args = parser.parse_args()

try:
    os.mkdir(args.destination)
except FileExistsError:
    pass

if args.service:
    service_declarations = [f"services/{args.service}.yaml"]
else:
    service_declarations = glob.glob("services/*yaml")

# in the future may support multiple styles of ingress
render_ingress()

for p in service_declarations:
    declaration = yaml.load(open(p), Loader=yaml.SafeLoader)
    project_name = declaration["project_name"]
    debug_mode = declaration.get("debug_mode", True)

    render_secrets(project_name, debug_mode, declaration["secrets"])
    render_rbac(project_name)
    for deployment in declaration.get("deployments", []):
        render_deployment(project_name, deployment)
    for cronjob in declaration.get("cronjobs", []):
        render_cronjob(project_name, cronjob)
