#!/usr/bin/env bash

set -Eeuo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${CASA_DEPLOY_HOST:-server.local}"
remote_directory="${CASA_DEPLOY_DIR:-repos/casa-m}"
public_url="${CASA_DEPLOY_URL:-https://casa.micro.isma.to}"
ssh_options=(-o BatchMode=yes -o ConnectTimeout=15)

fail() {
  printf 'Deployment failed: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing local command: $1"
}

for command_name in curl git jq rsync ssh; do
  require_command "$command_name"
done

[[ "$remote_host" =~ ^[A-Za-z0-9._@-]+$ ]] || fail "unsafe CASA_DEPLOY_HOST"
[[ "$remote_directory" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "unsafe CASA_DEPLOY_DIR"
[[ "$public_url" =~ ^https?://[^[:space:]]+$ ]] || fail "invalid CASA_DEPLOY_URL"

cd "$repository_root"

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]] &&
  [[ "${CASA_DEPLOY_ALLOW_DIRTY:-0}" != "1" ]]; then
  fail "the Git worktree is dirty; commit and push application changes before deploying"
fi

for resource_path in \
  scrapes \
  ui/public/property-images \
  ui/public/data/catalog.json \
  ui/public/data/rentals.json; do
  [[ -e "$resource_path" ]] || fail "missing required local resource: $resource_path"
done

jq empty ui/public/data/catalog.json
jq empty ui/public/data/rentals.json
expected_metrics="$({
  jq -c '{
    catalogVersion,
    published: .summary.publishedRecords,
    projects: ([.listings[] | select(.resultType == "Proyecto")] | length),
	    newProjects: ([.listings[] | select(.projectStatus != null)] | length),
	    amarilo: ([.listings[] | select(.source == "amarilo")] | length),
	    ciencuadras: ([.listings[] | select(.source == "ciencuadras")] | length),
	    ciencuadrasEvidence: ([.listings[] | select(any(.evidence[]?; .source == "ciencuadras"))] | length),
	    construccionesPlanificadas: ([.listings[] | select(.source == "construcciones-planificadas")] | length),
	    arquitecturaConcreto: ([.listings[] | select(.source == "arquitectura-y-concreto")] | length),
	    cusezar: ([.listings[] | select(.source == "cusezar")] | length),
	    constructoraCapital: ([.listings[] | select(.source == "constructora-capital")] | length),
	    zonario: ([.listings[] | select(.source == "zonario")] | length),
	    zonarioEvidence: ([.listings[] | select(any(.evidence[]?; .source == "zonario"))] | length),
	    topDevelopersAudited: .summary.topDevelopersAudited,
	    topDevelopersWithRegionalProjects: .summary.topDevelopersWithRegionalProjects,
	    officialProjects: ([.listings[] | select(.resultType == "Proyecto" and .sourceKind == "official")] | length),
    sabanaProjects: ([.listings[] | select(.resultType == "Proyecto" and .market == "sabana")] | length),
    apartmentTypes: ([.listings[] | .typologies[]?] | length),
    vienaTypes: ([.listings[] | select(.projectName == "Viena") | .typologies[]?] | length)
  }' ui/public/data/catalog.json
})"
expected_version="$(jq -r '.catalogVersion' ui/public/data/catalog.json)"
expected_rental_metrics="$(jq -c '{
  catalogVersion,
  published: .summary.publishedRecords,
  metrocuadrado: ([.listings[] | select(.source == "metrocuadrado")] | length),
  myhome: ([.listings[] | select(.source == "myhome")] | length),
  localImages: ([.listings[] | select(.imageUrl != null)] | length)
}' ui/public/data/rentals.json)"
expected_head="$(git rev-parse HEAD)"

printf 'Deploying Casa Mapa %s to %s:%s\n' \
  "${expected_head:0:7}" "$remote_host" "$remote_directory"
printf 'Expected catalog: %s\n' "$expected_metrics"
printf 'Expected rentals: %s\n' "$expected_rental_metrics"

remote_root="$(
  ssh "${ssh_options[@]}" "$remote_host" "set -eu
    cd '$remote_directory'
    unexpected_changes=\"\$(
      git status --porcelain --untracked-files=no |
        grep -Ev '^ M ui/public/data/(catalog|catalog-report|developers|rentals|rentals-report)\\.json$' || true
    )\"
    if test -n \"\$unexpected_changes\"; then
      printf 'Unexpected remote changes:\\n%s\\n' \"\$unexpected_changes\" >&2
      exit 1
    fi
    git restore -- ui/public/data/catalog.json ui/public/data/catalog-report.json
    if git ls-files --error-unmatch ui/public/data/developers.json >/dev/null 2>&1; then
      git restore -- ui/public/data/developers.json
    fi
    git pull --ff-only
    pwd
  "
)"
remote_root="$(printf '%s\n' "$remote_root" | tail -n 1)"
[[ "$remote_root" == /* ]] || fail "could not resolve the remote repository path"

remote_head="$(
  ssh "${ssh_options[@]}" "$remote_host" \
    "cd '$remote_directory' && git rev-parse HEAD"
)"
[[ "$remote_head" == "$expected_head" ]] || fail \
  "remote Git HEAD does not match local HEAD; push the local commit first"

ssh "${ssh_options[@]}" "$remote_host" \
  "mkdir -p '$remote_root/scrapes' '$remote_root/ui/public/property-images'"

printf '\nSynchronizing scrape artifacts...\n'
rsync -az --human-readable --stats \
  --exclude '.DS_Store' \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=15" \
  scrapes/ "$remote_host:$remote_root/scrapes/"

printf '\nSynchronizing cached property images...\n'
rsync -az --human-readable --stats \
  --exclude '.DS_Store' \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=15" \
  ui/public/property-images/ \
  "$remote_host:$remote_root/ui/public/property-images/"

printf '\nBuilding the production bundle and restarting Nginx...\n'
ssh "${ssh_options[@]}" "$remote_host" "set -eu
  cd '$remote_root'
  docker compose run --rm frontend
  docker compose up -d --no-deps nginx
  docker compose ps
  running_nginx=\"\$(docker compose ps --status running --services nginx)\"
  test \"\$running_nginx\" = nginx
  git restore -- ui/public/data/catalog.json ui/public/data/catalog-report.json ui/public/data/developers.json ui/public/data/rentals.json ui/public/data/rentals-report.json
"

remote_metrics="$(
  ssh "${ssh_options[@]}" "$remote_host" "
    set -eu
    cd '$remote_root'
    test -f ui/dist/data/catalog.json
    curl --fail --silent --show-error --max-time 20 \
      http://127.0.0.1:8091/data/catalog.json | jq -c '{
        catalogVersion,
        published: .summary.publishedRecords,
        projects: ([.listings[] | select(.resultType == \"Proyecto\")] | length),
	        newProjects: ([.listings[] | select(.projectStatus != null)] | length),
	        amarilo: ([.listings[] | select(.source == \"amarilo\")] | length),
	        ciencuadras: ([.listings[] | select(.source == \"ciencuadras\")] | length),
	        ciencuadrasEvidence: ([.listings[] | select(any(.evidence[]?; .source == \"ciencuadras\"))] | length),
	        construccionesPlanificadas: ([.listings[] | select(.source == \"construcciones-planificadas\")] | length),
	        arquitecturaConcreto: ([.listings[] | select(.source == \"arquitectura-y-concreto\")] | length),
	        cusezar: ([.listings[] | select(.source == \"cusezar\")] | length),
	        constructoraCapital: ([.listings[] | select(.source == \"constructora-capital\")] | length),
	        zonario: ([.listings[] | select(.source == \"zonario\")] | length),
	        zonarioEvidence: ([.listings[] | select(any(.evidence[]?; .source == \"zonario\"))] | length),
	        topDevelopersAudited: .summary.topDevelopersAudited,
	        topDevelopersWithRegionalProjects: .summary.topDevelopersWithRegionalProjects,
	        officialProjects: ([.listings[] | select(.resultType == \"Proyecto\" and .sourceKind == \"official\")] | length),
        sabanaProjects: ([.listings[] | select(.resultType == \"Proyecto\" and .market == \"sabana\")] | length),
        apartmentTypes: ([.listings[] | .typologies[]?] | length),
        vienaTypes: ([.listings[] | select(.projectName == \"Viena\") | .typologies[]?] | length)
      }'
  "
)"
[[ "$remote_metrics" == "$expected_metrics" ]] || fail \
  "remote Nginx catalog mismatch: $remote_metrics"

remote_rental_metrics="$(
  ssh "${ssh_options[@]}" "$remote_host" "
    set -eu
    curl --fail --silent --show-error --max-time 20 \
      http://127.0.0.1:8091/data/rentals.json | jq -c '{
        catalogVersion,
        published: .summary.publishedRecords,
        metrocuadrado: ([.listings[] | select(.source == \"metrocuadrado\")] | length),
        myhome: ([.listings[] | select(.source == \"myhome\")] | length),
        localImages: ([.listings[] | select(.imageUrl != null)] | length)
      }'
  "
)"
[[ "$remote_rental_metrics" == "$expected_rental_metrics" ]] || fail \
  "remote Nginx rental catalog mismatch: $remote_rental_metrics"

validation_directory="$(mktemp -d)"
trap 'rm -rf "$validation_directory"' EXIT
public_catalog="$validation_directory/catalog.json"
public_rentals="$validation_directory/rentals.json"
cache_buster="deploy=$expected_version"

curl --fail --silent --show-error --location --max-time 30 \
  "$public_url/data/catalog.json?$cache_buster" > "$public_catalog"
public_metrics="$(
  jq -c '{
    catalogVersion,
    published: .summary.publishedRecords,
    projects: ([.listings[] | select(.resultType == "Proyecto")] | length),
	    newProjects: ([.listings[] | select(.projectStatus != null)] | length),
	    amarilo: ([.listings[] | select(.source == "amarilo")] | length),
	    ciencuadras: ([.listings[] | select(.source == "ciencuadras")] | length),
	    ciencuadrasEvidence: ([.listings[] | select(any(.evidence[]?; .source == "ciencuadras"))] | length),
	    construccionesPlanificadas: ([.listings[] | select(.source == "construcciones-planificadas")] | length),
	    arquitecturaConcreto: ([.listings[] | select(.source == "arquitectura-y-concreto")] | length),
	    cusezar: ([.listings[] | select(.source == "cusezar")] | length),
	    constructoraCapital: ([.listings[] | select(.source == "constructora-capital")] | length),
	    zonario: ([.listings[] | select(.source == "zonario")] | length),
	    zonarioEvidence: ([.listings[] | select(any(.evidence[]?; .source == "zonario"))] | length),
	    topDevelopersAudited: .summary.topDevelopersAudited,
	    topDevelopersWithRegionalProjects: .summary.topDevelopersWithRegionalProjects,
	    officialProjects: ([.listings[] | select(.resultType == "Proyecto" and .sourceKind == "official")] | length),
    sabanaProjects: ([.listings[] | select(.resultType == "Proyecto" and .market == "sabana")] | length),
    apartmentTypes: ([.listings[] | .typologies[]?] | length),
    vienaTypes: ([.listings[] | select(.projectName == "Viena") | .typologies[]?] | length)
  }' "$public_catalog"
)"
[[ "$public_metrics" == "$expected_metrics" ]] || fail \
  "public catalog mismatch: $public_metrics"

curl --fail --silent --show-error --location --max-time 30 \
  "$public_url/data/rentals.json?$cache_buster" > "$public_rentals"
public_rental_metrics="$(jq -c '{
  catalogVersion,
  published: .summary.publishedRecords,
  metrocuadrado: ([.listings[] | select(.source == "metrocuadrado")] | length),
  myhome: ([.listings[] | select(.source == "myhome")] | length),
  localImages: ([.listings[] | select(.imageUrl != null)] | length)
}' "$public_rentals")"
[[ "$public_rental_metrics" == "$expected_rental_metrics" ]] || fail \
  "public rental catalog mismatch: $public_rental_metrics"

sample_id="$(
  jq -r 'first(.listings[] | select(.projectStatus != null) | .id)' \
    "$public_catalog"
)"
sample_image="$(
  jq -r 'first(.listings[] | select(.imageUrl != null) | .imageUrl)' \
    "$public_catalog"
)"
[[ -n "$sample_id" && "$sample_id" != "null" ]] || fail "no project found in public catalog"
[[ "$sample_image" == /* ]] || fail "no cached image found in public catalog"

spa_shell="$validation_directory/spa.html"
curl --fail --silent --show-error --location --max-time 20 \
  "$public_url/explore/property/$sample_id?projectStatus=new&$cache_buster" \
  > "$spa_shell"
grep -q '<div id="root"></div>' "$spa_shell" || fail \
  "nested SPA route did not return the app shell"
curl --fail --silent --show-error --location --max-time 20 \
  --output /dev/null "$public_url$sample_image?$cache_buster"

rental_id="$(jq -r '.listings[0].id' "$public_rentals")"
rental_image="$(jq -r 'first(.listings[] | select(.imageUrl != null) | .imageUrl)' "$public_rentals")"
curl --fail --silent --show-error --location --max-time 20 \
  "$public_url/rentals/property/$rental_id?source=metrocuadrado&$cache_buster" \
  > "$spa_shell"
grep -q '<div id="root"></div>' "$spa_shell" || fail \
  "nested rental SPA route did not return the app shell"
curl --fail --silent --show-error --location --max-time 20 \
  --output /dev/null "$public_url$rental_image?$cache_buster"

printf '\nDeployment validated successfully.\n'
printf 'Public URL: %s\n' "$public_url"
printf 'Catalog: %s\n' "$public_metrics"
printf 'Rentals: %s\n' "$public_rental_metrics"
printf 'Nested route: /explore/property/%s\n' "$sample_id"
printf 'Cached image: %s\n' "$sample_image"
printf 'Rental nested route: /rentals/property/%s\n' "$rental_id"
