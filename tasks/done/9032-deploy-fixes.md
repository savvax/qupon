---
id: 9032
title: Deploy fixes — keypairs via secrets, /data ownership, CLI shim path, config in image, proxy pda validation
agent: claude
tier: T1
depends_on: [032]
verify: make verify
timeout_min: 45
---
## Goal
Review of 032: the deployed /advance cannot work (no keypairs, /data root-owned vs USER qupon, CLI shim path, config only via sftp) and the web proxy forwards an unvalidated pda with the bearer token.

## Acceptance criteria
- [ ] `docker build` + `docker run` locally: /healthz OK, `qupon --help` runs inside the image, keypairs from `*_KEYPAIR_JSON` env land as files readable only by the service user.
- [ ] Proxy rejects a non-base58 pda with 400. `make verify` green.
