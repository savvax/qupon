---
id: 1424
title: Org PATCH validates the website only when it is sent
agent: claude
tier: T1
depends_on: [1419]
verify: make verify
timeout_min: 20
---
## Goal
Review of 1419: org.go validates the merged website on every PATCH, so an org with a stored legacy value without a scheme cannot change its name. Validate only when req.Website != nil.
