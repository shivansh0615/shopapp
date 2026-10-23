# Current campaign policy

Updated: 22 October 2026.

## Owner-approved behavior

- Only one campaign may be ACTIVE per shop: single gift OR tiered rewards.
- Draft and paused campaigns do not occupy the active slot.
- Tiered rewards are cumulative within that one campaign.
- Up to five thresholds are available while billing is off. The stored future
  plan ladder is 2 / 3 / 5; it is not current paid-plan enforcement.
- Existing extra ACTIVE rows are not automatically paused. Do not activate
  additional campaigns to test arbitration.
- ACTIVE records with future/expired schedules retain their capacity slot until
  paused or saved as drafts. Schedule eligibility and active-slot capacity are
  different concepts.

## Implementation and compatibility

Capacity enforcement lives in `app/lib/campaign-capacity.ts` and campaign
service/repository paths. Tier allowances live in `app/lib/plan-tier-allowance.ts`.
Legacy selection/tie-break code remains for old data/configurations; it is not
a merchant promise that multiple campaigns can run together.

Preserve gift tags, paid same-SKU lines, currency semantics and checkout
eligibility. Gift synchronization must work without a visible progress bar.

## Evidence and remaining verification

Use the latest dated [deployment log](deployment-test-log-2026-10-21.md).
Earlier 972-test and two-campaign results were historical snapshots.
Do not repeat stale claims that all one-campaign code is uncommitted or that a
particular older theme release is current: inspect Git and deployed versions.

A user-reported second-activation rejection is not a real multi-connection
PostgreSQL concurrency test. Worker operation and live scheduled transitions
need separate verification. Savor's reported eligibility/display failures remain
subject to current regression testing.

No new campaign types, paid plans, independent product-specific campaigns or
cross-campaign stacking are authorized by this policy document.
