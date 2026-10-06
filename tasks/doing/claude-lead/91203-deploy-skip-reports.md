---
id: 91203
title: Deploy rsync skips reports/ (18 MB of screenshots the images never use)
agent: claude
tier: T1
depends_on: [1203]
verify: make verify
timeout_min: 15
---
## Goal
ops/deploy-vps.sh rsyncs 26 MB, 18 MB of it reports/ screenshots; over a slow uplink that is 20+ minutes. Neither Dockerfile copies reports/. Exclude it.
