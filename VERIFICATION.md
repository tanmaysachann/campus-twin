# Verification record

Run from the repository root:

```bash
./scripts/verify.sh
```

The verification pipeline performs:

1. Python bytecode compilation of the application package.
2. The full pytest suite, including domain, API, data-contract and deployment-copy checks.
3. An in-process FastAPI smoke run covering health, twin summary, simulation, local analysis and SPA serving.
4. A deterministic anti-slop design-contract audit: no gradients/glass, no oversized radii, no sub-11px functional text, and preservation of the Impeccable review contract in `DESIGN.md`.
5. A relative Markdown link audit so packaged documentation cannot point at missing files.
6. JavaScript syntax checks when Node is available.

When a local server is already running, the first-screen Judge Demo path can be checked with:

```bash
python scripts/judge_demo_smoke.py
```

That script builds the same resilience scenario as the browser flow, posts it to `/api/scenarios/simulate`, and confirms persistence when the active source is Databricks.

Latest generation-environment result:

```text
............                                                             [100%]
smoke ok {'source': 'demo-fallback', 'ops_score': 74.9, 'scenario': 'recommended'}
design audit ok: no gradients/glass, no oversized radii, no sub-11px functional text
link audit ok: all relative Markdown targets resolve
Verification complete.
```

## Additional checks performed

- The deterministic data generator was rerun and both development/deployment snapshot hashes remained identical.
- The local FastAPI server returned HTTP 200 from `/api/health`.
- Markdown-relative links are checked before packaging.
- Python caches and test caches are excluded from the delivery ZIP.

## What cannot be verified without your workspace

- Databricks bundle validation against your authenticated Free Edition workspace.
- Actual Unity Catalog privileges available to your account.
- SQL warehouse execution under your workspace's quota state.
- Genie Agent creation/chat in your workspace.

Those integrations follow the documented Databricks REST/bundle contracts, but workspace-dependent execution must be validated after you supply the warehouse ID and permissions.
