#!/usr/bin/env bash
# Let the box's existing Caddy (tyntro, compose project props-prod) also serve Qupon's two hosts — WITHOUT touching any
# tyntro file: two routes are added to the running Caddy through its admin API (inside the container, localhost:2019).
# Caddy applies a config change atomically and keeps the old config if the new one is rejected.
#   Idempotent: re-run after the tyntro Caddy restarts (runtime routes are not saved to its Caddyfile).
#   Undo:  docker exec props-prod-caddy-1 caddy reload --force --config /etc/caddy/Caddyfile --adapter caddyfile
#          docker network disconnect qupon_edge props-prod-caddy-1
set -euo pipefail
C=props-prod-caddy-1
H=185-216-25-91.sslip.io
ADMIN=http://127.0.0.1:2019

get() { docker exec "$C" wget -qO- "$ADMIN$1"; }
post() { docker exec "$C" wget -qO- --header 'Content-Type: application/json' --post-data "$2" "$ADMIN$1" >/dev/null; }

docker network inspect qupon_edge >/dev/null 2>&1 || docker network create qupon_edge >/dev/null
docker network connect qupon_edge "$C" 2>/dev/null || true # "already connected" is fine

# the HTTP server that listens on :443 (the Caddyfile adapter names it srv0, srv1, …)
S=$(get /config/apps/http/servers | python3 -c 'import json,sys; s=json.load(sys.stdin); print(next(k for k,v in s.items() if any(l.endswith(":443") for l in v.get("listen",[]))))')
echo "edge: tyntro Caddy server with :443 is $S"

route() { # id hosts(comma-separated) upstream
  cat <<EOF
{"@id":"$1","match":[{"host":["${2//,/\",\"}"]}],"terminal":true,"handle":[{"handler":"subroute","routes":[{"handle":[
 {"handler":"headers","response":{"set":{"Strict-Transport-Security":["max-age=31536000"],"X-Content-Type-Options":["nosniff"],"Referrer-Policy":["strict-origin-when-cross-origin"],"X-Frame-Options":["DENY"]}}},
 {"handler":"reverse_proxy","upstreams":[{"dial":"$3"}]}]}]}]}
EOF
}
# qupon.fun (Cloudflare-proxied, SSL mode Full: Caddy gets the origin cert via HTTP-01 through Cloudflare)
for spec in "qupon-web qupon.$H,qupon.fun qupon-web:3000" "qupon-api api.$H,api.qupon.fun qupon-registrar:8080"; do
  set -- $spec
  if ! cur=$(get "/id/$1/match/0/host" 2>/dev/null); then
    post "/config/apps/http/servers/$S/routes" "$(route "$1" "$2" "$3")"
    echo "edge: route $1 → $3 for $2 added"; continue
  fi
  # existing route: append any host it lacks (busybox wget can only GET/POST; POST to an array appends)
  for h in ${2//,/ }; do
    case "$cur" in *"\"$h\""*) ;; *) post "/id/$1/match/0/host" "\"$h\""; echo "edge: route $1 += $h";; esac
  done
done
