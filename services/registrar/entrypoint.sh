#!/bin/sh
# Container entrypoint: Fly mounts /data as root, and operator keypairs arrive as secrets
# (QUPON_<ROLE>_KEYPAIR_JSON = the keypair file's JSON array). Write each to a file readable only by
# the service user, point the CLI's QUPON_<ROLE>_KEYPAIR at it, then drop privileges.
set -eu
mkdir -p /data /run/qupon
chown qupon:qupon /data /run/qupon
chmod 700 /run/qupon
for role in REGISTRAR ISSUER PAYING_AGENT; do
  eval "json=\${QUPON_${role}_KEYPAIR_JSON:-}"
  [ -n "$json" ] || continue
  f="/run/qupon/$(echo "$role" | tr 'A-Z_' 'a-z-').json"
  printf '%s' "$json" > "$f"
  chown qupon:qupon "$f"
  chmod 600 "$f"
  export "QUPON_${role}_KEYPAIR=$f"
  unset "QUPON_${role}_KEYPAIR_JSON"
done
exec su-exec qupon /app/registrar "$@"
