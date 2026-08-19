# WOODLANDS — CLIENT INPUTS

*What we need from Dhiren and Rose, what they have already given us, and what surfaces as we build. Live document.*

**Created: 19 August 2026** · **Last updated: 19 August 2026**

---

## WHAT THIS DOC IS

One list of every dependency on a person rather than on code. It exists because these were scattered across `WOODLANDS_MEETING_FEEDBACK_2026-07-27.md`, `WOODLANDS_FOLLOWUPS.md` and session notes, which meant walking into a meeting without a single sheet of what to ask.

Three sections, and the distinction matters:

- **OPEN** — we are blocked or partly blocked until someone answers. Take these into the meeting.
- **KNOWN** — already answered. Recorded so it is not asked twice, and so a later session does not "discover" a decision that was made months ago.
- **SURFACED WHILE WORKING** — found during a build, needs a client answer, not yet raised. This is the inbox; items graduate to OPEN when they are put in front of him.

**Next touchpoint: feedback call 28 August 2026.** Full-system walkthrough **Mon 31 Aug / Tue 1 Sep**.

---

## OPEN — needed from the 28 August call onward

### 1. Attendance capture — the FA03H decision · **BLOCKS THE WHOLE ATTENDANCE END-GOAL**

**What we need:** a decision between two paths for how a staff member's arrival actually gets captured.

- **(a) Export / import.** Dhiren already has an **FA03H face-and-fingerprint machine**. If its records can be pulled off the device — USB stick, a vendor export, anything that produces a file — we import them into `attendance_records` on a schedule and the system reconciles against the roster. Cheapest by far: no new hardware, no new spend, and it uses a machine already on site that staff already use.
- **(b) Invest in a networked unit.** A device with PC software and a network connection, writing to a database we can read on a schedule or in near-real-time. Costs money and needs specifying, but removes the manual export step permanently.

**What we need him to find out:** whether the FA03H he owns can export at all, and in what format. That is a question for the device or its supplier, not for us — we cannot answer it from here.

**Why it matters:** this **replaced the QR staff attendance build**. QR was the plan out of the 27 July meeting and is specified in `WOODLANDS_FUNCTIONAL_SPEC.md` §4; it is now superseded. The design arc that got here is in `WOODLANDS_HISTORY.md` (19 August entry) — QR → card-and-scanner → PIN → the discovery that he already owns the machine.

**What it blocks:**

- The entire Attendance end-goal. Nothing gets built here until the path is chosen.
- `ClockInOutTab` — the app's only self-service clock-in surface and its only GPS code — is **built and mounted nowhere** (FIX_PLAN C-02). Whether it is wired, rewritten or deleted depends entirely on this answer.
- The lodge coordinates / 100 m geofence constants (C-44), which only matter on a path that geofences.
- **Today the honest answer to "how does a staff member clock themselves in?" is "they can't."** Attendance is manager-entered only. If the walkthrough script includes staff clock-in, this is a P1, not a P2.

---

### 2. Shift times for Administration, Maintenance and Transport · **8 staff**

**What we need:** the actual start time, end time, late threshold and days per week that Rose runs for these three departments.

**Why it matters:** `shift_settings` has **no row at all** for them. This is not a mis-tagged value — the Block 1 data-op (`data-ops/009`) fixed all three of those and proved the other eight departments now resolve correctly. These three have nothing to resolve *to*.

Measured live, 19 August, after the re-tag:

| Department | Staff | Resolves to |
|---|---|---|
| Administration | 3 | **nothing — Shift column shows `—`** |
| Maintenance | 3 | **nothing — Shift column shows `—`** |
| Transport | 2 | **nothing — Shift column shows `—`** |
| *(the other 8 departments)* | 54 | a real shift, correctly |

**What it blocks:** for those 8 staff — the Shift column, late-minute calculation, the overtime flag, and the coverage-alert loop. All silently inert.

**These are Rose's real times. We must not invent them** — a placeholder shift here would silently produce wrong lateness figures for real people, which is worse than a visible `—`.

---

### 3. Where the attendance station lives, and whether photo-on-scan is wanted

**What we need:** two answers carried over unanswered from the 27 July meeting (items 8 in that doc's question list).

- **Location.** Where physically does the capture point sit? Reception was the obvious suggestion. It has to be somewhere staff pass at shift start, on premises, and not somewhere a person can check in from home.
- **Photo on scan.** Capture an image at the moment of scan to deter card- or code-sharing. It **stores** an image, it does not match one — so it is not biometrics and breaks no standing rule. This was to be *offered, not built unasked*.

**Why it matters:** both were framed around QR. The FA03H path may answer the first by default (the machine is already somewhere) and make the second moot (a face unit already sees the person). **Re-ask them in the FA03H framing rather than assuming they carried over.**

---

### 4. Real operational data for the post-approval integration

**What we need:** the real lists, to replace the placeholder and demo cohort. Named individually because they come from different people and can land separately.

| Data | From | Currently |
|---|---|---|
| Bar stocktake — real quantities per item per bar | Bar heads | 559 real item names + SKUs live; **quantities are a flat placeholder** |
| Bar minimum / par levels per item per bar | Bar heads, **not Dhiren** | placeholder: par = 2× reorder, uniform reorder levels |
| Department stock lists — Kitchen, Restaurant, Grounds, Security | Rose / department heads | departments exist, **items do not** |
| Housekeeping catalogue | Rose | 7 placeholder `HK-` items (migration 060) |
| Room list — numbers or names | Dhiren | **24 placeholder rooms** (060) |
| Staff roster reconciliation, incl. 12 missing phone numbers | Rose / Martin | 62 real staff; some fields incomplete |
| Real stallholder details | Rose | 305 real holders + **6 `Z00n` placeholders to purge** |
| Menus from the POS PDFs | Dhiren | not imported |

**Why it matters, and why it is deliberately not blocking:** the client framing decision from 27 July stands — **prove the modules work before perfecting the data.** Real data goes in only after Dhiren verifies the system, in a joint session with Rose and Martin. Recorded here so the ask is ready the moment he signs off, not so it is chased now.

---

## KNOWN — already decided by the client

Do not re-ask these. If one needs revisiting, note the reason and move it to OPEN.

- **The six Farmers Market fees — confirmed by Dhiren, 18 August 2026.** All six are live in `fm_fee_schedule` (migration 061). This also corrected `src/lib/constants.js`, whose ID-card fees were **wrong, not merely stale** — 5,000 / 10,000 against Dhiren's actual 30,000 / 20,000.
- **The four-role model.** `owner` · `admin` (front desk) · `department_head` (scoped by department, several per department) · `hr`. One scoped role, not a role per department. Built and proven live (migrations 037–044); 5 head accounts plus hr exist.
- **The attendance problem statement, in his words.** *No login from home. Catch lateness and no-shows. The owner should not have to sit and check.* This is the requirement the FA03H decision has to satisfy — it is about **capture that cannot be gamed**, not about a particular technology. QR was one answer to it; it was never the requirement itself.
- **Prove the modules before perfecting the data** (27 July). Existing real data stays the test bed; the missing-data chase is off the critical path until he verifies.
- **Walkthrough target: Mon 31 Aug / Tue 1 Sep 2026.** Feedback call 28 August.
- **Stall-number format `A001`–`A347`** — three-digit, zero-padded, A-prefixed. Code matches (`STALL_RE`, shared by Add and Edit). ⚠ **Sign-off still owed** before any ID cards are printed — printed cards and physical stall signage have to agree with the system. If he picks a different format, one constant changes.
- **Revenue reading — three shipped, one to be chosen.** Rather than guess what "revenue should be different" meant, Events ships **three toggleable readings** with the default flagged provisional on screen. He picks one on the 28th and the other two plus the toggle come out. Two things to put to him at the same time: Events showed **no** revenue figure at all before that build, so "different" may have meant "absent"; and `events.total_amount` is a stale `0` against a MWK 1,800,000 bill that no Events code reads or maintains.

---

## SURFACED WHILE WORKING

Found during a build, needs a client answer, **not yet raised with him.** Promote to OPEN when it goes into a meeting.

### Demo-visible: corrupted text in a live table booking

`table_bookings.special_requests` on the **Hannah Gondwe** row reads:

> `Birthday Ã¢â¬â cake to be brought in`

An em-dash that was misdecoded when the row was seeded on 26 July — the same UTF-8-read-as-Windows-1252 fault that `scripts/data-ops/007_encoding_heal.sql` fixed elsewhere, from before `apply-sql.ps1` grew its guard. **Found during Block 1, not caused by it.**

**Why it needs raising:** it is on one of only three live bookings, so it is very likely to be on screen during the walkthrough. It is cosmetic, it is a one-row data-op to heal, and it needs no client *decision* — but it does need a decision about **when**, since it means touching production data before a demo. Not fixed in Block 1 because that block's single data-op was scoped to the shift re-tag.

### Comped event lines are currently forbidden

`event_bill_items` carries an `amount > 0` CHECK, so a line item cannot be zero — which means **a comped item cannot be recorded on an event bill at all.** Carried in FOLLOWUPS as a Dhiren question and still unanswered.

**What we need:** does the lodge ever comp a line on an event bill — a complimentary bottle, a waived room-hire — and does he want it to appear on the bill at zero, or be left off entirely?

**Why it matters:** the answer decides whether the constraint is correct as written or wants relaxing to `>= 0`. Relaxing it is a migration, so it sits behind the 062 rebuild proof either way. Worth asking now so the answer is ready when the gate opens.

### The imported stallholder cohort can never be forfeit-eligible

Every imported holder's `created_at` is the **import date**, not their real join date, so the three-month forfeiture window measures from when we loaded the file rather than from anything true about the holder. **Only the 6 `Z00n` placeholders can currently become forfeit-eligible.**

**What we need:** either real join dates from the February 2026 register, or a decision to run the forfeiture rule from a nominated start date and accept the first cycle is measured from that.

**Why it matters:** the forfeiture feature (061) is built and proven, and on real data it will simply never fire. That is a silent no-op, which is the worst failure mode — the screen looks right and does nothing.

### ID card price #3 unconfirmed

The third ID-card scenario is currently charged at the **replacement** rate. Documented as an assumption in `src/lib/constants.js` rather than a confirmed fee. Needs one word from Dhiren to close, and it sits alongside the six fees he already confirmed on 18 August — so it is a cheap add-on to that conversation.

---

## HOW TO UPDATE THIS DOC

- An item that gets answered moves **SURFACED → OPEN → KNOWN**, keeping its text, gaining the answer and the date. Do not delete the question — the reasoning behind an answer is worth more later than the answer alone.
- Anything found mid-build that needs a person, not code, goes straight into **SURFACED WHILE WORKING** in the same session it is found.
- If an item in KNOWN turns out to have been misunderstood, move it back to OPEN with a note saying what was misread. That is a real event and hiding it costs a second meeting.
