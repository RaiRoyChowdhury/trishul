# Status report: master upgrade
Upgrade of the existing prototype (no rebuild). Unchanged: logo, Durga assets, palette, six core features.
**Priority 1 (done, see matrix):** Sarvam-only AI, ₹20 budget + 30-day window + auto Demo Mode, Safety Map comparison, SOS + No-Touch, Walk Together with TrustPass and location gating, minor safeguards, honest ID status, Judge Demo, Admin centre, 3 languages, responsive UI, installable PWA.
**Priority 2 (done at prototype level):** Shakti Network, Evidence Vault, privacy settings, Telegram flow + docs.
**Priority 3:** planned only (see FUNCTIONALITY-REPORT.md).
v8 added: zones weighted by recency (30-day half-life) and report confidence, dashboard status card (Telegram/AI/location), Admin demo reset (fictional data only), route tests, screenshots, two-map comparison.
Known gap: nothing was run against live services.
Migration to run: `supabase/migrations/2026-12-master-upgrade.sql` (already included at the end of `schema.sql`; for an existing database run the migration files 2026-11 then 2026-12).
