# UpsellTrix engineering handover

Updated: 22 October 2026. This is a navigation and continuation guide, not a
certificate that the current build passes every theme.

## Read before editing

1. Read [rules.md](rules.md) and inspect current Git status/diffs.
2. Read the latest dated entries in the [testing log](docs/deployment-test-log-2026-10-21.md).
3. Preserve all existing Cursor/user edits, including untracked Savor tests.
4. Do not commit, push, deploy, publish themes or modify campaign settings without
   authorization for the action.

## Current product policy

One ACTIVE campaign per shop: single gift OR cumulative tiered rewards.
Up to five tiers are allowed while billing is off. Multiple drafts/paused
campaigns may be kept. Do not restore the former two-active-campaign policy.
See [campaign policy](docs/campaign-policy-progress.md).

## Current priority

Investigate and verify Savor's reported wrong-item actions, duplicate celebration,
failed gift requalification, and gift appearance after the cart dropped from
about 1198 to about 500. Confirm the actual threshold and Shopify cart data;
these reports do not alone establish a root cause.

The 22 October item-1 record says gifts work without a visible bar. A focused
208-test run was independently repeated before this cleanup. That does not
certify the drawer, checkout, live tiered behavior, or subsequent Cursor edits.
Review the latest code and evidence before proceeding to drawer-bar removal.

## Ownership and safeguards

- Runtime source is under `storefront-extension/src/runtime/`; matching Shopify
  assets are copied by the storefront build. Do not maintain divergent copies.
- Preserve `_fgpb_free_gift`, `_fgpb_campaign_id`, and `_fgpb_tier_id`.
- Paid copies of gift variants must remain paid and editable.
- Reject outdated eligibility; reconcile in-flight gift changes against the latest cart.
- Preserve full-price gift protection, discount attribution, and serialized mutations.
- Test actual cart contents separately from drawer HTML and checkout.
- Keep one embed; gift synchronization must not depend on progress-bar placement.

## Runtime and release references

Node >=22.18; React Router 7; React 18; Prisma/PostgreSQL.
The current Admin client uses API 2026-07; the Discount Function configuration uses
2026-01. Verify source configuration before future version changes.

App origin: https://upselltrixapp.algorithmtrix.com
Development store: algorithmtrix-development.myshopify.com

`npm run deploy` uses `shopify.app.release.toml`. Node hosting and worker
deployment are separate. GitLab validation/build is not proof of either deployment.
Do not reuse the older September handover's production-config or runtime-version
claims as current instructions.

## Verification and operations

- [Test suites](docs/development/test-suites.md)
- [Storefront build ownership](docs/development/storefront-build.md)
- [Theme portability](docs/architecture/theme-portability.md)
- [Deployment handoff](docs/ops/deployment-engineer-handoff.md)
- [Worker scheduling](docs/ops/worker-scheduling.md)
- [Environment contract](docs/ops/environment-contract.md)
- [Database migration procedure](docs/ops/database-migrations.md)
- [App Store preparation](docs/app-store/README.md)

For a cart fix, test below threshold, qualify, reduce below threshold, requalify,
rapid changes, delayed responses, empty cart and paid/free copies of one variant.
Check celebrations and totals, then verify checkout eligibility separately.
Use one campaign at a time. Record the exact build/theme and unverified cases.

App Store submission history and old checklist files are historical evidence.
Verify the current reviewer feedback and deployed behavior before declaring
resolution or resubmitting. Never invent approval or universal compatibility.
