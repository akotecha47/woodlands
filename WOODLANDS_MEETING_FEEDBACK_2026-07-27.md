# WOODLANDS — MEETING FEEDBACK, 27 JULY 2026

*Organised notes from the feedback session with Dhiren. Aman's raw notes, restructured.*

**Drafted: 9 August 2026**

---

## THE FRAMING DECISION

Agreed with Dhiren: **prove the modules first, perfect the data later.** Real names of customers, clients, stallholders and staff are not the priority yet. First the system must be shown to work and every module must behave the way he wants it to. Final data accuracy comes at the end.

This does not mean purge what is already loaded — the 62 staff, 305 stallholders and 559 stock items stay as the test bed. What it releases is the chase: 12 missing stallholder phone numbers, stall 205's unknown holder, stall 226's duplicate, and the joint data session with Rose and Martin all move off the critical path.

---

## INVENTORY — TWO-TIER STOCK

Everything that comes into the lodge is logged into the inventory room. One main store, one inbound point. Thereafter it is distributed out to departments as and when needed.

**One inflow, multiple outflows.** Goods enter once and leave to many places.

Each department has its own dedicated stock list — not a shared catalogue filtered by department, a distinct list per department.

| Department | Representative stock |
|---|---|
| Main store | everything — the master catalogue |
| Restaurant Bar | drinks, mixers, bar consumables |
| Sports Bar | drinks, mixers, bar consumables |
| Kitchen | food, kitchen consumables |
| Restaurant | restaurant consumables |
| Housekeeping | cleaning supplies, room consumables — tissues, water, tea, coffee |
| Laundry | detergent, bleach, laundry consumables |
| Grounds | pool chemicals, garden supplies, tools |

Grounds covers the pool as well as the garden.

Departments that already exist in the system (item lists empty): Kitchen, Restaurant, Housekeeping, Grounds and Security, plus the two bars which hold stock. Two things to square with Dhiren: **Security** exists as a department but he did not name it in the meeting, and **Laundry** he did name but it is not in the existing set. Confirm both on the call.

---

## BARS — MINIMUM LEVELS AND THE END-OF-DAY CYCLE

Both bars must hold a minimum level of drinks before opening for the day.

The daily cycle:

1. Bartender counts stock at end of day
2. Bartender reports those levels in the system
3. System compares against the bar's minimum levels
4. Bartender requests a refill back up to minimum
5. Refill is fulfilled from the main store before the next working day begins

---

## CONSUMPTION TRACKING — WHAT, WHERE, WHO

Named as a problem they currently face: they cannot see which rooms have used which stock.

The requirement is a record of what is being used, where it went, and who used it. Three dimensions on every consumption event:

- **What** — the item and quantity
- **Where** — the department, and for housekeeping and laundry the specific room
- **Who** — the staff member who drew it

Laundry records must be held for one year and be queryable.

**Note:** rooms are not currently a concept in the system. The six modules are Inventory, Events, Farmers Market, Table Bookings, Attendance and Admin — there is no rooms module. A rooms reference has to exist before stock can be attributed to one.

---

## USERS AND ROLES

The requested user list:

| Person | Function |
|---|---|
| Dhiren | Owner |
| Rose | Front desk / admin |
| Secret | Front desk / admin |
| Sanjay | Restaurant head |
| Patrick | Restaurant head |
| Daniel | Restaurant head |
| *(4th, name TBC)* | Restaurant head |
| Head — Housekeeping | *(TBC)* |
| Head — Laundry | *(TBC)* |
| Head — Grounds | *(TBC)* |
| Head — Restaurant Bar | *(TBC)* |
| Head — Sports Bar | *(TBC)* |
| Martin | HR |

Dhiren's phrasing was "other heads of department, one per department." Restaurant has three or four heads though — so "one per department" is the general shape, not a hard rule. Worth noting for the design.

---

## ATTENDANCE — QR CHECK-IN

The proposal on the table is a QR code per staff member, scanned at the start of shift. Kept on the premises specifically so lateness and no-shows cannot be disguised.

Design note worth raising with him: the direction that works is **staff hold the card, the lodge holds the scanner** — a fixed scanning device at a known point on site. A wall of staff QR codes scanned by staff phones fails on two counts: not every staff member has a smartphone, and anyone can scan anyone's code off a wall.

The existing Farmers Market public check-in is the same shape (public endpoint, QR payload, scan writes a visit row) so this reuses a pattern already built.

The repo standing rule reads "no biometrics this phase — manual clock in/out only." QR is not biometrics so no conflict on that clause, but it does supersede the "manual only" part — note the change.

---

## FARMERS MARKET — 3-MONTH ATTENDANCE HISTORY AND WAITING LIST

A history list showing clearly who has attended in the last three months and who has not. Anyone who has not come for three months forfeits their slot, and it goes to someone on the waiting list.

Requires:

- A three-month attendance rollup per holder, driven off `fm_visits`
- A clear split between attended and not attended, not a raw log to be interpreted
- A waiting list — confirm with him whether one exists today and where it lives
- A forfeiture action that vacates a stall and reassigns it, with the change recorded

---

## FARMERS MARKET — PRODUCT TAXONOMY

The current categorisation is too coarse. His example: ten vendors all sell paintings, but within those ten each sells something different — oil paintings, wax, and so on. Same for vegetables, bread, jewellery, necklaces.

Three levels, not one:

| Level | Example | Example | Example |
|---|---|---|---|
| Category | Crafts | Produce | Food & Beverages |
| Product type | Paintings | Vegetables | Bread |
| Item | Oil painting, wax painting | Tomatoes, spinach | Sourdough, focaccia |

**This closes two items open in `WOODLANDS_FOLLOWUPS.md`:** the uniform `stall_type = 'Other'` on all 305 imported rows, and the `fm_holders.products` text blob that couldn't be normalised because comma-splitting would fragment real product names. A controlled taxonomy replaces string-splitting with selection from a list.

---

## FARMERS MARKET — FEES

New chargeable items:

| Item | Fee (MWK) | Notes |
|---|---|---|
| Product change | 10,000 | Charged per change to a stallholder's products within the system |
| ID cards | 30,000 | Inclusive of two cards |
| Replacement card | 20,000 | Per additional or reprinted card |

The product-change fee attaches to the taxonomy work above — the change action has to raise the fee, or it will not get charged.

---

## UX / UI DEFECTS

**Payments tab on Events cannot be edited.** Payments can be recorded but not corrected.

**Revenue should be different in Events.** Not specific enough to build from — get him to point at the number on screen and say what it should say instead.

Both raised from a user's point of view, not a functional one.

---

## QUESTIONS TO RESOLVE ON THE 10 AUGUST CALL

1. What "revenue should be different" means, pointing at the actual number on screen
2. The complete department list — reconcile Dhiren's verbal list against what already exists in the system (Security exists but wasn't named; Laundry named but not yet a department) — and the fourth restaurant head's name
3. Room list — numbers or names — so stock can be attributed to rooms
4. Bar minimum levels per item per bar. From the bar heads, not from Dhiren
5. Whether a Farmers Market waiting list exists today, and where it lives
6. The existing FM fee schedule, so the new fees sit inside a complete list
7. Stall number format `A001`–`A347` — sign-off, before any ID cards are printed under the new fee schedule
8. Where the attendance scanning station lives, and whether a photo on scan is wanted
9. What Martin sees as HR

---

## TIMELINE AND COMMITMENTS

| Date | Event |
|---|---|
| Mon 27 July | Feedback session with Dhiren |
| Tue 28 July | Travel to South Africa, medical. Dhiren aware |
| Fri 7 August | Back in Malawi |
| Sat 9 August | Notes organised; docs brought current to end goal |
| Week of 11 August | Build to functional-complete on placeholder data (deadline 15th) |
| TBC (early that week) | Call with Dhiren; then full app for verification |

**Commitment made to Dhiren:** something to show on return, and a call with feedback (originally floated as Monday 10 August; exact day now TBC).
