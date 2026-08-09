# WOODLANDS — STATE

*Current state, live commitments, next action. Updated at the end of every session that changed state.*

**Last updated: 9 August 2026**
**Governing doctrine:** STREAMLINE_BUILD_STANDARD.md v1.5, STREAMLINE_MATERIALS.md v2.4, STREAMLINE_SESSION.md v2.0.

---

## WHAT IT IS

Lodge in Lilongwe. Family relationship — Dhiren is Aman's uncle.

- **Owner:** Dhiren (Aman's uncle)
- **Ops manager:** Rose Ngalawango
- **HR:** Martin Lisilira
- **Staff:** 62 in `staff` table
- **Modules built (6):** Inventory, Attendance, Events, Table Bookings, Farmers Market, Admin
- **Roles (4):** `owner`, `manager`, `kitchen_manager`, `restaurant_manager`
- **System users:** 4

---

## THE GOAL — PHASE 2, FUNCTIONAL-COMPLETE ON PLACEHOLDER DATA

**Target: a fully functioning app on placeholder data by the week of 11 August (deadline 15th).** Every screen works and is populated. Once Dhiren verifies the modules work to his satisfaction, real data goes in — not before.

**The end-goal system is specified in `WOODLANDS_FUNCTIONAL_SPEC.md`.** Scope source is `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`. Read the spec for what "finished" looks like module by module.

**Client framing decision (Dhiren, 27 July):** prove the modules work before perfecting the data. Existing real data (305 stallholders, 62 staff, 559 stock items) stays as the test bed; the missing-data chase (bar stocktake, department stock lists, staff reconciliation, menus, 12 missing phone numbers) is off the critical path for this week.

---

## COMMERCIAL SHAPE — GIFT BUILD

**Aman is not charging Dhiren.** Uncle. Decided at inception.

- Delivered no different from a paying client — full working system, security compliance, professional handover.
- Exchange: a delivered testimonial, and referrals to Dhiren's contacts.
- Reference value under Materials methodology for an equivalent paying client: ~MWK 6–9M. Internal only, never quoted. Shapes polish budget — full professional delivery, not infinite polish.

---

## STACK

- React + Vite + Tailwind + Supabase (Pro, ref `gttsjmxltrxxfplqjans`) + Vercel
- Live: `woodlands-beta.vercel.app`
- Repo: `akotecha47/woodlands`
- Auth: Supabase Auth on `sb_publishable_*` + `sb_secret_*` key pair. Legacy JWT keys disabled 26 July — the previously-exposed key is permanently invalid.
- Departments plain text, never FK.

---

## WHAT'S LIVE — REAL VS PLACEHOLDER

**Real:** 305 Farmers Market stallholders (via `scripts/data-ops/001`); 559 bar item catalogue — 276 Restaurant Bar + 283 Sports Bar (via `scripts/data-ops/002`), names + SKUs real; 62 staff roster; 4 system users.

**Placeholder / demo:** bar stock quantities (pending stocktake); attendance (2–3 seed days); 1 seeded event; a few table bookings.

**Empty / not there:** Kitchen, Restaurant, Housekeeping, Grounds, Security stock lists (departments exist, items don't); Laundry (not yet a department); Farmers Market visits + payments; menu items from POS PDFs.

---

## THE GATE — MIGRATION HISTORY RECONCILIATION (P1, blocks new schema)

Remote history records only 001–007 while 001–030 have run. `supabase db push` is disqualified — it would replay migration 016's staff INSERT and duplicate all 62 staff. Every migration from 021 on applied by hand via the SQL Editor. Five ghost-schema bugs have come from this.

Phase 2 adds 8–12 tables. Hand-applying them guarantees more ghost schema. **Fix the history, prove `db push`, then build.** Until this closes, Standard §2.6 rebuild-from-migrations keeps failing (three tables — `event_checklists`, `shift_settings`, `tables` — still uncreatable from files).

---

## KNOWN BUGS / BROKEN PATHS

- **Transfers don't deduct stock.** Found 27 July browser test. Requisitions deduct correctly; department transfers don't. Directly relevant to two-tier inventory — store→department movement is the core mechanic.
- **Events payments tab not editable.** Recordable, not correctable. Phase 2 UX fix.
- **`public-checkin` returns an internal `detail` field on failure.** Aids diagnosis; drop before handover.

---

## VERIFY-AGAINST-LIVE (don't trust the docs)

- **`stock_movements.movement_type` CHECK** — FOLLOWUPS says it does NOT permit `opening_balance` and migration 030 didn't add it; HISTORY/ARTIFACTS say 030 did. **Contradiction — probe the live CHECK, correct the wrong doc.**
- **GPS clock-in geofence** — does the 100 m radius / `unverified` logic exist in live code?
- **Stall-number regex** in Add Holder — two-digit vs live three-digit `A001`–`A347`.
- **Add User** — does it still branch on dead bar1/bar2 `bar_week` logic?

---

## PHASE 2 SCOPE (see FUNCTIONAL_SPEC for detail)

Two-tier inventory + per-department stock lists · bar par levels + end-of-day refill cycle · consumption attribution (what/where/who) + rooms + 1-year laundry retention · expanded role model (`department_head` scoped, `admin`, `hr`) · QR staff attendance · Farmers Market 3-month attendance history + waiting-list forfeiture + 3-level product taxonomy + fee schedule (10k / 30k / 20k) · Events payments editable + revenue display.

---

## LIVE COMMITMENTS

- **Full working system delivered no different from a paying client.**
- **Something to show on return, and a call with Dhiren.** Made 27 July. Aman back in Malawi; call likely early in the week of 11 August, exact day TBC.
- **Testimonial + referrals** post-handover. Nothing specific discussed yet.

---

## CADENCE

- **26–27 July** — hardening (Sprints A–E) + FM import + bar import + feedback meeting.
- **28 July – 7 August** — Aman travelling (South Africa, medical). No dev work.
- **9 August (today)** — docs brought current to the end goal; build planning.
- **9–15 August** — Phase 2 build to functional-complete on placeholder data. Deadline 15th.
- **Call with Dhiren** — early in the week, day TBC; then the full working app for verification.
- **After Dhiren verifies** — real data goes in (joint session with Rose + Martin), then `WOODLANDS_AUDIT_3.md` against real data, then Sprint F handover mechanics.

---

## NEXT ACTION

Build order, gate first:
1. **Migration history reconciliation** (the gate).
2. **UX fixes** — Events payments editable (quick); revenue (blocked on Dhiren — resolve or build toggleable).
3. **Role model** — `department_head` scoped + `admin` + `hr`; rooms concept. Precedes module work.
4. **Two-tier inventory + per-department stock lists** — folds in the transfers bug.
5. **Bar par levels + end-of-day cycle** — on top of two-tier.
6. **Consumption attribution + rooms + laundry retention** — on top of two-tier.
7. **Farmers Market taxonomy + waiting list + fees** — self-contained.
8. **QR attendance** — self-contained, reuses `public-checkin` pattern.

Every new table ships with placeholder seed in its own step.

---

## BLOCKING

Revenue display is blocked on Dhiren (what "different" means). Everything else is internal — migration reconciliation is the gate in front of new schema.

---

## STATUS SUMMARY

Hardening done, real data live, docs now point at the end goal. Building Phase 2 to functional-complete on placeholder data by the 15th, migration reconciliation first, then role model, then the module work.
