#!/usr/bin/env sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
api_dir=$(CDPATH= cd -- "$repo_dir/../ClyvoraAPI" && pwd)
env_file="$repo_dir/infra/docker/production.env"

test -f "$env_file" || { echo "Missing infra/docker/production.env" >&2; exit 1; }
test -f "$api_dir/services/liveopweg/package.json" || { echo "Missing sibling ClyvoraAPI checkout" >&2; exit 1; }

git -C "$api_dir" pull --ff-only origin main
git -C "$repo_dir" pull --ff-only origin main

docker compose \
  --env-file "$env_file" \
  -f "$repo_dir/infra/docker/compose.production.yml" \
  -f "$repo_dir/infra/docker/compose.clyvora-api.yml" \
  -f "$repo_dir/infra/docker/compose.public.yml" \
  config --quiet

docker compose \
  --env-file "$env_file" \
  -f "$repo_dir/infra/docker/compose.production.yml" \
  -f "$repo_dir/infra/docker/compose.clyvora-api.yml" \
  -f "$repo_dir/infra/docker/compose.public.yml" \
  up --build --detach --remove-orphans

docker compose \
  --env-file "$env_file" \
  -f "$repo_dir/infra/docker/compose.production.yml" \
  -f "$repo_dir/infra/docker/compose.clyvora-api.yml" \
  -f "$repo_dir/infra/docker/compose.public.yml" \
  ps
