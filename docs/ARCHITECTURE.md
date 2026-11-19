---
title: "Legacy Architecture Reference"
description: "Canonical architecture documentation is available in the architecture section."
order: 98
draft: true
---

# UpdatePilot Architecture (legacy link)

The canonical architecture reference is now [Architecture overview](architecture/overview.md), followed by [Internal systems](architecture/internals.md). The prior standalone description conflated release, Docker, and health adapter contracts and identified a GitHub dependency that is not present in the current runtime. These links describe **actual current source behavior**, including the injected router, candidate health checks, recovery boundary, and unsupported Compose mode.

For API contracts see [Public API index](api/index.md) and [Traffic router integration](guides/integration.md).