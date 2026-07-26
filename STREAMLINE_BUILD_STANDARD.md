# STREAMLINE BUILD STANDARD

*The internal doctrine for how Streamline Systems builds, secures, tests, and delivers every client system.*

**Version 1.5 — 24 July 2026**
**Applies to: every build. No exceptions without a written reason.**

**Change log:**
- v1.5 (24 July 2026): Added four rules from Phalombe V4→V6 rebuild cycle. §1 Stage 5: mechanical diff sent-vs-returned. §2 Non-Negotiables: client instruction outranks source data; rebuilds preserve affordances unless removal was explicitly requested. §3 Definition of Done: bulk changes require decomposed findings; no single-threshold counts to clients.
- v1.4 (24 July 2026): Added audit-against-raw-sources rule to Stage 5. Added client-doc arithmetic reconciliation to Definition of Done. Both surfaced from Phalombe recon defects that would have passed a same-summary audit.
- v1.3 (24 July 2026): Added Stage 7 RETROSPECTIVE — every completed build now feeds a written lessons pass that updates doctrine. Reframed §0 principle to include compounding improvement alongside consistency (the floor rises with every unit, and never drops).
- v1.2 (17 July 2026): Added periodic in-flight audit rule under Stage 4 after Phalombe's first checkpoint audit caught a HIGH finding. See §1 Stage 4.
- v1.1 (17 July 2026): Removed permanent staging project requirement. Replaced with one-project-per-client model. Risky changes after go-live use Supabase database branches instead of a separate staging environment. See §4.
- v1.0 (12 July 2026): Initial version.

---

## 0. THE PRINCIPLE

A manufacturer earns trust by shipping a product that is reliable, safe, durable, and repeatable — and by getting better at shipping it, unit after unit.

Streamline is a manufacturer of operational systems. The product is superior when:

- It does not break in week one.
- It cannot be trivially hacked.
- It can be rebuilt from scratch if it dies.
- It matches the reliability of every unit before it (the floor never drops).
- It embodies every lesson from those builds (the floor rises with each one).

You do not get there by building carefully. You get there by building the **same way every time**, through gates that catch defects before they ship, *and* by refining the way after every build so the next one is better than the last. This document is the production line. Follow it even when it's slower — it is slower in the way a safety inspection is slower.

**The one rule under all the rules:** the way you test is never the way that risks the client's real, live data.

---

## 1. THE BUILD LIFECYCLE

Every client passes through seven stages, in order. Each stage produces a defined artifact and ends at a gate. You do not enter the next stage until the gate is passed.

### Stage 1 — DIAGNOSE
Understand the loss. This is the discovery meeting. You are diagnosing before prescribing.
- **Produces:** the Brief (what the business is, where it's bleeding, what "visibility and control" means for them specifically).
- **Gate:** you can state, in one sentence, what this system stops costing the owner. If you can't, you don't scope yet.

### Stage 2 — SCOPE
Define exactly what gets built, and — just as important — what does not. Draw the boundary.
- **Produces:** the Scope doc **and the data model**. The data model is a written list of every table, every column, every relationship, designed *up front on paper*, before any code.
- **Gate:** the data model is written and it covers the whole scope. If a table isn't on the blueprint, it doesn't get built.

### Stage 3 — SET UP
Provision the project correctly from hour zero. Security and structure are baked in at the start, never retrofitted.
- **Produces:** a correctly provisioned project — one Supabase project per client, security defaults in place, migration files as the source of truth, `CLAUDE.md` seeded with this Standard.
- **Gate:** the Non-Negotiables (Section 2) are all true *before the first feature is built*, not deferred to before handover.

### Stage 4 — BUILD
Sprints, sequenced. But sprints are sized by **risk and weight, not by convenience.**

- **Weight a sprint before starting it.** A sprint that touches money, auth, or the data model is heavy — it gets its own session, its own verification, and it does not get bundled with cosmetic work.
- **Periodic in-flight audits.** Audits are not only a pre-handover event. A fresh Claude session — never the one writing the code — runs a read-only audit against this Standard at natural checkpoints during the build (every 3–5 sprints, or after any heavy sprint). The auditor is fresh precisely because the writer is not. Do not skip audits because "it feels clean" — clean feelings are the mode in which the writer misses things.
- **Produces:** working, committed, pushed increments. Manual git commit after each verified step.
- **Gate:** each sprint builds clean (`npm run build`), is tested against representative test data before any real client data enters the system, and its schema changes are in a migration file. Then it's committed.

### Stage 5 — HARDEN (QC)
The final hardening pass. Not the only audit — the last one.
- **Produces:** a passed audit against the Definition of Done (Section 3). Run the read-only audit prompt with a fresh session. Fix every CRITICAL and HIGH before proceeding.
- **Audits recompute from raw sources, not from summaries.** For any data pipeline or code path that transforms client data, the audit reads the original client source files and independently derives the answer, then compares to the pipeline's output. An audit that validates the pipeline's output against the pipeline's own summary catches nothing — the summary was written by the same code being audited. Applies to all data deliverables.
- **Marked-up client deliverables are diffed, not interpreted.** Where a client returns any marked-up version of a Streamline deliverable — spreadsheet, document, prototype, mock — the first action is a mechanical cell-by-cell (or field-by-field) diff of the version sent against the version returned. The diff is the authoritative instruction set. Reading the returned file to form a picture of what the client decided is not a substitute. The diff is produced before any rebuild begins and retained as the record of what the client asked for.
- **Gate:** the Pre-Handover Checklist (Section 6) is fully green.

### Stage 6 — HANDOVER
Physical meeting. Live ownership transfer. Never an email with credentials.
- **Produces:** transferred ownership (Supabase, Vercel, GitHub) to the client's own accounts; a one-page reference doc; a defined 30-day warranty window.
- **Gate:** client owns everything, can reset a password unaided, and understands what each module does. Then Streamline is out of the driver's seat.

### Stage 7 — RETROSPECTIVE (v1.3)
The finished build teaches. Every completed job gets a written retrospective — not for the client, for Streamline.
- **Produces:** `{CLIENT}_RETROSPECTIVE.md` in the client's project. One page. Three questions:
  1. What did this build teach us? Concrete lessons, not platitudes.
  2. What should the Standard / Materials / Session doctrine now say that it didn't? Rule updates flow from this back to the master project.
  3. What is now templatable? Patterns, prompts, code, scope structures that compound into the next build.
- **Gate:** the retrospective is written and any doctrine changes are versioned into the master workspace within one week of handover. Not "we'll think about it later." Lessons that live only in the head evaporate at build ten.

---

## 2. THE NON-NEGOTIABLES

Violate any of these and the product is **defective** — the same way a car with no brakes is defective regardless of how nice the interior is. These are not "best practice." They are the definition of a Streamline product being fit to sell.

### Security defaults
1. **The service role key never touches the browser.** Not in a `VITE_*` variable, not in a client-side `supabaseAdmin`. Vite bakes every `VITE_*` var into the public bundle — anyone with DevTools reads it. All admin/privileged operations go through a Supabase **Edge Function**.
2. **RLS is part of "the table exists," not a later task.** Every new table, at creation, in the same migration: `ENABLE ROW LEVEL SECURITY`, a policy for `service_role`, `GRANT ALL TO service_role`, plus the role-specific policies the feature needs. A table without RLS is not "built" — it's a hole.
3. **Storage buckets are private by default.** Signed URLs only. No world-readable financial documents, ID photos, or deposit slips.
4. **Only the anon key is client-side.** Secrets live in env / Edge Function secrets. Never hardcoded, never committed.
5. **Every route checks a role.** No page reachable by a user who shouldn't reach it. Verify with real test users per role, not by assumption.

### Schema is the single source of truth
6. **Schema changes go into a numbered migration file FIRST, then run.** The file is the blueprint. If a column isn't in a migration file, it does not exist — even if it's live in the dashboard. The test of a durable product: *if the database died tomorrow, could you rebuild it from the migration files alone?*

### Safe testing
7. **Real client data is treated as sacred once it enters the system.** Before the client's real data is loaded, the project can be used freely for testing — no real data means nothing to break. After real data is live, breaking changes go through a Supabase database branch, snapshot restore, or scheduled maintenance window. Test users, test transactions, and test deposits get purged before real data is loaded.

### Client instructions and rebuilds
8. **Client instruction outranks source data.** A value the client has supplied is a decision, not a data point to be reconciled. Where client instruction and source data disagree, the client's value is correct by definition and the source is wrong — even where the source is internally consistent and the client's value is not. An internally inconsistent client instruction is a question to ask, never a value to override.
9. **Rebuilds preserve every usability affordance of what they replace unless removal was explicitly requested.** Data validation, conditional formatting, colour keys, frozen panes, filters, dropdowns, legends — all of it survives a rebuild by default. Structural instructions ("restructure from seven sheets to two") are about structure, not about permission to strip affordances. If a rebuild is worse to use than the version it replaces, that's a defect regardless of whether the structural instruction was followed.

---

## 3. DEFINITION OF DONE

A feature, a sprint, or a build is **not "done"** until all of these are true. "It works on my screen" is not done.

- [ ] Builds clean: `npm run build` passes with no errors.
- [ ] No service role key anywhere in the client bundle.
- [ ] RLS enabled and policies written for every table it touches — **verified by SQL query against the live DB, not assumed from code.**
- [ ] Every schema change it made is in a numbered migration file.
- [ ] Tested against representative test data before running against real client data.
- [ ] Any money/quantity calculation is guarded against the obvious lie: negatives, double-inserts, timezone/date-boundary errors.
- [ ] For client-facing documents: every table sums to the totals stated elsewhere in the same document. Reconciliation is automated on doc build and runs before "done" — a client-facing doc where "1,109 confirmed separate" contradicts a table total showing 32 is a defect regardless of how correct the underlying analysis is.
- [ ] Any bulk change is proposed only after the underlying finding has been decomposed into its actual constituents. A count of a category ("166 non-ASCII characters", "918 department disagreements", "1,870 pricing conflicts") is not actionable until the category is broken down. The decomposition goes to the decision-maker with the proposal, not after it.
- [ ] Any count quoted to a client comes from an exhaustive scan with the test explicitly stated, or it does not get quoted. A single-threshold sample ("lowest tier below 10% of next") is a starting point, never a conclusion. If the test cannot be made exhaustive, say so rather than giving a number.
- [ ] Committed and pushed.

---

## 4. PROJECT PROVISIONING — ONE PROJECT PER CLIENT

Each client's build lives in **one Supabase project** — the same project from first migration through handover and beyond. Streamline does not maintain a separate staging project.

**Ownership:** the project is created under the client's own Supabase organisation from day one (or created under Streamline's account and transferred at handover). The client pays infrastructure costs from the start, in USD, billed directly by Supabase.

**Before real client data is loaded (pre-live phase):**
- Develop directly against the project
- Test data can live alongside dev data
- Migrations run as they're written
- Iterate fast, break things, fix them

**Once the client's real data is live:**
- The project is now sacred
- Breaking changes go through a Supabase database branch, a snapshot restore into a temporary project, or a scheduled maintenance window
- Non-breaking changes (new tables, new columns with defaults, features that don't touch existing data or logic) can go directly to prod, provided they pass Definition of Done
- Test users and test transactions are purged before the go-live cutover

**Concurrency:** if you're running multiple client builds simultaneously, each has its own project. This is the concurrency model. No shared benches.

---

## 5. THE PER-CLIENT ARTIFACT SET

Every client build carries the same documents, in journey order. A stranger opening any Streamline project finds the same structure.

1. **Brief** — the diagnosis. What the business is, where it bleeds.
2. **Scope** — what's in, what's out. The boundary.
3. **Data Model** — the blueprint. Every table and column, designed before code.
4. **Pricing** — paying clients only.
5. **CLAUDE.md** — in the repo root. Seeds every Claude Code session with the spec and a pointer to this Standard.
6. **`{CLIENT}_AUDIT.md`** files — one per in-flight audit and the final hardening pass. Committed in the repo.
7. **Followups log** — running list of small deferred items not blocking the current stage.
8. **Handover reference** — the one-pager the client keeps.
9. **`{CLIENT}_RETROSPECTIVE.md`** — one page, written after handover. Feeds doctrine updates.

---

## 6. PRE-HANDOVER CHECKLIST (THE QC INSPECTION)

No system is handed to a paying client until every line is green.

**Security**
- [ ] No service role key in the client bundle (checked in the built JS, not just the source).
- [ ] RLS verified by SQL on every table.
- [ ] Every route role-gated, verified with per-role test users.
- [ ] Storage buckets private, signed URLs only.
- [ ] No public write endpoint that lets a stranger create a privileged account.

**Durability**
- [ ] The entire schema can be rebuilt from migration files alone.
- [ ] No orphaned/undocumented columns living only in the dashboard.
- [ ] Money and quantity logic guarded against negatives, double-inserts, and date-boundary bugs.
- [ ] Test users and test transactions purged before real data cutover.

**Handover mechanics**
- [ ] Client has their own Supabase, Vercel, and GitHub accounts, provided *before* the meeting.
- [ ] Ownership transferred live, in person.
- [ ] Client can reset a user's password unaided.
- [ ] One-page reference delivered.
- [ ] 30-day warranty window stated and dated.

**The stranger test**
- [ ] Would a stranger who opened DevTools on this system conclude a real company built it? If a curious visitor with F12 open would conclude the opposite, it does not ship.

---

## 7. WHAT THIS FIXES, IN ONE LINE

Before this document: you build, test, and deliver inside the same object, with no blueprint and no inspection, and hope it holds.

After this document: you design the blueprint, provision correctly from day one, inspect against a fixed standard at every checkpoint, hand over a unit you could rebuild from scratch, and write down what the build taught so the next one is better.

That is the difference between a workshop and a factory. It is also the difference between a favour for family and a product a stranger pays for.
