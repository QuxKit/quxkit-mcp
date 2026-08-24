# @quxkit/quxkit-mcp

**QuxKit** · one MCP server for the whole family

![status](https://img.shields.io/badge/status-v0.1-d29922) ![licence](https://img.shields.io/badge/licence-undecided-6e7681) ![tests](https://img.shields.io/badge/tests-15-2ea043)

There used to be one server per kit — `billing-kit-mcp`, `ui-kit-mcp`, each its
own binary and its own entry in a client's config. That scales badly in the
obvious way, and in a less obvious one: an assistant holding five connections
has no way to know they describe one system, so nothing composes. A question
spanning billing and UI becomes two conversations.

This is one server that mounts whichever kits are installed.

```
                      one client, one connection
                                 │
                    ┌────────────▼────────────┐
                    │      quxkit-mcp         │
                    │  depends on NO kit      │
                    └────────────┬────────────┘
                                 │ dynamic import, per kit
        ┌────────────────┬───────┴────────┬─────────────────┐
        ▼                ▼                ▼                 ▼
  billing-kit-mcp    ui-kit-mcp    translation-kit     quxkit_status
  price · ledger     vocabulary    locales · lookup    what mounted,
  discovery · db     components    search · missing    what failed
  (installed?)       tokens        (installed?)        (always)
        │                │                │
   not installed →  absent, silently. Present but broken →
   named in quxkit_status, and the other kits still work.
```

## It depends on no kit, and that is the design

Every kit is loaded with a dynamic import inside a try. Three reasons that is
not just convenience:

- **The family is separable.** Depending on all of them would mean installing
  billing-kit to get translation tools — a server that un-separates what the
  family deliberately separates is working against the thing it serves.
- **They are not licensed alike.** billing-kit and integration-kit are
  Apache-2.0; UI-Kit, comm-kit and rag-kit are commercial per seat. A package
  bundling all of that tooling would be redistributing commercial source under
  whatever licence it chose for itself. Mounting what an operator already holds,
  on their own terms, sidesteps it.
- **Failure stays legible.** A kit that is installed but broken is reported by
  name, and the others still load. The alternative is a process that exits
  before registering anything, and an operator guessing which kit did it.

## Installing

```jsonc
// claude_desktop_config.json, or any MCP client
{
  "mcpServers": {
    "quxkit": {
      "command": "npx",
      "args": ["-y", "@quxkit/quxkit-mcp"],
      "env": {
        "BILLING_KIT_MCP_DATABASE_URL": "postgres://…",   // optional
        "BILLING_KIT_MCP_TENANT": "…",                     // optional
        "TRANSLATION_KIT_MCP_DATABASE_URL": "postgres://…",// optional
        "TRANSLATION_KIT_MCP_TENANT": "…"                  // optional
      }
    }
  }
}
```

Install the kits you use alongside it. Nothing else is required — with no kits
at all the server still starts and still answers, which is deliberate:

```
quxkit-mcp ready — no kits found
```

## `quxkit_status` is always there

Ask it first. It reports which kits mounted, what each contributed, and any kit
that is installed but failed to load.

It also exists for a mechanical reason. With no tools registered, the MCP SDK
advertises no `tools` capability at all, so `tools/list` answers *"Method not
found"* — an operator with a broken config would meet a protocol error instead
of an explanation. One always-present tool guarantees the capability exists.

## What each kit contributes

| Kit | Needs | Tools |
|---|---|---|
| `billing-kit` | nothing | Exact money math and double-entry balance checks — the arithmetic an assistant most reliably gets wrong, and it needs no connection. Plus API and component discovery. |
| `billing-kit` | `BILLING_KIT_MCP_DATABASE_URL` | Usage, ledger, subscription and wallet reads. |
| `ui-kit` | installed | The facet vocabulary, per-component contracts, resolved token values, and a linter that catches a bad draft before it is written to disk. |
| `translation-kit` | `TRANSLATION_KIT_MCP_DATABASE_URL` + `_TENANT` | Which locales exist, what a key says, finding a string by its text, and what is still untranslated. |

Two deliberate omissions:

**translation-kit's connection is read-only.** Its `transaction` throws, so
nothing reachable from a tool can write — and `publish`, which needs one, is
never enabled from here. Publishing puts words in front of users; a server an
assistant talks to is not where that decision belongs.

**A kit needing configuration it does not have registers nothing.** Offering
tools that fail on every call is worse than offering none: an assistant cannot
tell a misconfiguration from an empty catalogue, and will confidently report
that a product has no strings.

## What replaced what

`@quxkit/billing-kit-mcp` and `@quxkit/ui-kit-mcp` still ship their own
binaries and still work. This does not fork them — it imports their register
functions, so there is one definition of each tool rather than two that drift.

`app-kit`'s `/api/mcp` route is a different thing and is untouched: a per-tenant
HTTP endpoint inside a generated application, serving that application's own
domain. It is not a family tool and does not belong here.

## Tests

15, and no kit is installed to run them. The interesting cases are *nothing
installed*, *one kit installed*, and *a kit present but broken* — all reachable
with fake kit modules, which is also the evidence this package genuinely depends
on none of them.

Four run a real client against a real server over an in-memory transport,
because listing a tool and being able to call it are different claims.

## Licence

**Undecided, and deliberately unstated.** No LICENSE file, `private: true`.
Nothing here grants anyone anything and nothing reaches npm by accident. That is
the reversible default; declaring a licence nobody chose is not — and it matters
more here than usual, because this server sits next to kits under three
different licences.
