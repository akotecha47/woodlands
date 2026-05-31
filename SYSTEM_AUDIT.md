# Woodlands Lodge — System Audit

## Route Access Control

Defined in `src/lib/roles.js` via `ROUTE_ACCESS`:

| Route | Roles |
|-------|-------|
| `/` (Inventory) | owner, manager, store_supervisor, bar1, bar2 |
| `/attendance` | All staff roles |
| `/events` | owner, manager |
| `/table-bookings` | owner, manager, restaurant_manager, bar1, bar2, head_waiter, waiter |
| `/farmers-market` | owner, manager, farmers_market_admin |
| `/admin` | owner |

---

## Login

**File:** `src/pages/Login.jsx`  
**Access:** Public

**Form fields:** Email, Password

**Actions:**
- Sign In — authenticates via Supabase Auth, fetches role from user_profiles, navigates to default route based on role

---

## Admin Module

**File:** `src/pages/Admin.jsx`  
**Access:** owner only  
**Tabs:** Users · Add User · Departments · Stock Items

---

### Users Tab

**File:** `src/components/admin/UsersTab.jsx`

**Columns:** Name · Email · Role · Department · Shift · Bar Wk · Status · Created · Actions

**Data fields:** full_name, email, role, department, shift_name, bar_week, is_active, created_at

**Actions:**
- Edit — opens modal to update full_name, department, shift_name, bar_week
- Deactivate / Reactivate — toggles is_active

**Business rules:**
- Bar roles (bar1, bar2) require bar_week (A or B)
- Non-rotating shifts auto-selected if only one available for the chosen department
- Rotating shifts excluded from the shift dropdown

---

### Add User Tab

**File:** `src/components/admin/AddUserTab.jsx`

**Form fields:** full_name (required), email (required), password (required, min 6 chars), role (required), department (optional), shift_name (conditional), bar_week (required for bar1/bar2 only)

**Actions:**
- Create User — POSTs to Edge Function `create-user` via direct fetch with anon key

**Display:**
- Success box showing email, password, and role with instruction to share credentials securely

**Business rules:**
- Bar Week field only shown for bar1/bar2 roles
- Shift auto-selected if department has exactly one non-rotating shift
- Form resets after successful creation

---

### Departments Tab

**File:** `src/components/admin/DepartmentsTab.jsx`

**Data displayed:** Department name list

**Actions:**
- Add — text input creates new department
- Edit — inline edit with Save/Cancel
- Delete — requires window.confirm before deletion

---

### Stock Items Tab

**File:** `src/components/admin/StockItemsTab.jsx`

**Columns:** Name · SKU · Unit · Department · Reorder Level · Status · Actions

**Data fields:** name, sku (auto-generated), unit, department, reorder_level, is_active (Active/Inactive badge)

**Actions:**
- Edit — inline editing for name, unit, reorder_level
- Deactivate / Reactivate — toggles is_active (no delete)

**Business rules:**
- SKU auto-generated as `{DeptCode}-{PaddedCount}` (e.g. KIT-001)
- Department codes: Kitchen→KIT, Restaurant Bar→RBA, Sports Bar→SBA, Restaurant→RST, Housekeeping→HSK, Grounds→GRD, Security→SEC, default→GEN
- Unit defaults: Kitchen/Restaurant→kg, Bar→litres, else→units

---

## Attendance Module

**File:** `src/pages/Attendance.jsx`  
**Access:** All staff roles

**Tabs by role:**
- owner / manager: Today · History · Settings
- restaurant_manager: Today · Clock In/Out
- All other roles: Clock In/Out only

---

### Clock In/Out Tab

**File:** `src/components/attendance/ClockInOutTab.jsx`

**Data displayed:** full_name, department, shift_name, bar_week, shift_start, shift_end, current state (idle/working/break/done), GPS status, live net hours (refreshes every 5 s)

**States and actions:**
- Idle → Clock In button
- Working → Start Break · Clock Out buttons
- Break → End Break button
- Done → Summary of Clock In, Clock Out, break duration, net hours

**Business rules:**
- On Clock In, GPS compared to lodge coordinates (within 100 m radius)
- If outside radius or GPS unavailable: status set to `unverified`, flagged for manager review
- If within radius: status set to `present` or `late` based on shift_start + late_threshold
- Final break and net hours calculated and displayed after clock-out

---

### Today Tab

**File:** `src/components/attendance/TodayTab.jsx`  
**Access:** owner, manager, restaurant_manager only

**Summary cards:** Present · Late · Absent · Unverified · Not Yet Arrived

**Controls:** Department filter dropdown

**Columns (per department group):** Staff Name · Shift · Clock In · Clock Out · Hours · Break · Status · Radius · Actions

**Status logic:**
- If no record before 11:00 → "not_arrived"
- If no record after 11:00 → "absent"
- Radius: ⚑ if outside, ✓ if verified, — if null

**Actions:**
- Mark All Absent button — creates absent records for all unclockedstaff; visible only after 11:00 and only to owner/manager
- Override — modal to change individual status
- Note — modal to add/edit notes

**Business rules:**
- Consecutive absence alert: highlights staff absent 2+ days in last 3 days
- Coverage alert: "Dept: no coverage" shown if no present/late staff during a shift window
- owner/manager excluded from the staff list displayed

---

### History Tab

**File:** `src/components/attendance/HistoryTab.jsx`  
**Access:** owner, manager, restaurant_manager only

**Filters:** Staff · Department · Status · From Date · To Date · Clear

**Default range:** Last 14 days to today

**View modes (toggle):**
- Daily — grouped by week; columns: Date · Staff Name · Dept · Shift · Clock In · Clock Out · Break · Net Hours · Mins Late · Status · Radius · Notes; week total row
- Weekly Summary — one row per person per week; columns: Staff Name · Department · Week · Present · Late · Absent · Total Hours · Avg Clock-in

**Business rules:**
- Records still clocked in (no clock_out) marked as "Active"

---

### Settings Tab

**File:** `src/components/attendance/SettingsTab.jsx`  
**Access:** owner, manager, restaurant_manager only

**Columns:** Department · Shift Name · Start · End · Late Threshold (min) · Days/Week · Type · Actions

**Actions:**
- Edit — inline row editing
- Delete — removes shift_settings row
- Add Shift — form to create new shift definition

**Data fields:** department, shift_name, shift_start (HH:MM), shift_end, late_threshold (mins), days_per_week, shift_type (standard / rotating badge)

---

## Events Module

**File:** `src/pages/Events.jsx`  
**Access:** owner, manager  
**Tabs:** Events · Create Event (plus detail overlay when viewing an event)

---

### Events List Tab

**File:** `src/components/events/EventsListTab.jsx`

**Summary strip:** Events This Month · Confirmed & Unpaid Deposit · Events in Next 7 Days

**Filters:** Status (All / Enquiry / Confirmed / In Progress / Completed / Cancelled) · Deposit (All / Paid / Unpaid)

**Sort options:** Date · Deposit Status · Guest Count

**Columns:** Event Name · Type · Date · Time · Guests · Venue · Deposit · Checklist · Status · Actions

**Row highlighting:** Amber if event is within 7 days (and not cancelled) or status=confirmed with unpaid deposit

**Actions:**
- View — opens EventDetailTab overlay
- Edit — modal to edit event fields (owner/manager only)
- Delete — confirmation modal; permanently removes event, checklists, payments, and bill items

---

### Create Event Tab

**File:** `src/components/events/CreateEventTab.jsx`

**Form fields:** Event Name (required), Event Type (required: wedding/conference/birthday/corporate/private_dinner/other), Event Date (required, defaults to today), Start Time, End Time, Guest Count, Venue Area (Main Hall/Garden/Pool Deck/Restaurant/Other), Organiser Name, Organiser Phone, Organiser Email, Special Requirements, Notes

**Actions:** Create Event button

**Business rules:**
- New events created with status=enquiry and deposit_paid=false
- BEO checklists are not generated at this stage; shown as info message
- Form resets after success

---

### Event Detail Tab

**File:** `src/components/events/EventDetailTab.jsx`

**Header:** Event name, status badge, deposit badge, task progress (X/Y tasks), Back button

**Status pipeline actions:**
- enquiry → Confirm Event
- confirmed → Start Event
- in_progress → Complete Event
- Any non-terminal status → Cancel Event

**Info grid:** Type · Date · Time · Guests · Venue · Organiser · Contact · Email · Created · Special Requirements · Notes (all read-only)

**BEO Checklists section:** Auto-generated when status changes to confirmed or in_progress; grouped by department (Kitchen, Bar, Grounds, Front Desk); each task has a checkbox, name, due_time, assigned_to, and completed_by with date; overall and per-department progress bars shown

**Business rules:**
- If status=enquiry and no checklists: info message shown, no checklist rendered
- If status=confirmed/in_progress and no checklists exist, generateBEO() inserts default tasks from BEO_TASKS constant

---

### Event Bill Section

**File:** `src/components/events/EventBillSection.jsx`

**Columns:** Category · Description · Amount · Delete (manager only)

**Bill Total row:** Sum of all amounts in MWK

**Add item form (owner/manager only):** Category (Venue Hire/Catering/Beverages/Accommodation/Equipment & AV/Decoration & Setup/Security/Grounds & Outdoor Setup/Staff Service Charge/Other), Description, Amount (MWK)

**Business rules:**
- Description required if category is "Other"

---

### Event Payments Section

**File:** `src/components/events/EventPaymentsSection.jsx`

**Summary cards:** Bill Total · Total Paid (with refund breakdown) · Balance Due (red if outstanding, green if paid in full)

**Payment history columns:** Date · Type · Method · Amount · Reference · Received By

**Add payment form (owner/manager only):** Payment Type (Deposit/Balance/Additional/Refund), Amount, Payment Date, Payment Method (Cash/Card/Bank Transfer/TNM Mpamba/Airtel Money), Reference, Received By (staff dropdown), Notes

**Business rules:**
- Recording a Deposit payment automatically sets events.deposit_paid=true
- totalPaid = sum of non-refund payments minus sum of refund payments
- balanceDue = max(0, billTotal − totalPaid)

---

## Farmers Market Module

**File:** `src/pages/FarmersMarket.jsx`  
**Access:** owner, manager, farmers_market_admin  
**Tabs:** Market Day · Holders · Add Holder · Payments

**Constants:**
- Stall Types: Produce, Crafts, Food & Beverages, Clothing, Other
- Payment Methods: Cash, Bank Transfer, TNM Mpamba, Airtel Money
- Payment Types & Fees: Application Fee (MWK 10,000), Registration Fee (MWK 20,000), Visit Fee (MWK 10,000)
- Market day = last Saturday of the month

---

### Market Day Tab

**File:** `src/components/farmers-market/MarketDayTab.jsx`

**Controls:** Date picker · Live indicator · Add Holder button (manager) · Checked-in count badge

**Market Conditions field:** Free-text textarea; auto-saves after 1.5 s debounce; read-only for past dates

**Fee Reconciliation strip (shown when at least one check-in exists):** Expected · Collected · Outstanding (red if > 0)

**Holders table columns:** Stall No · Name · Business · Type · Check In · Log Fee · Remove (manager only)

**Actions:**
- Check In — creates fm_visits record; disabled if already checked in; shows time if already done; note icon if visit notes exist
- Log Fee — records payment for checked-in holder; shows "✓ Paid" once paid; manager only
- Remove — deletes visit and any associated fee payments; manager only

**Modals:** Add Holder (list of unregistered holders to add) · Log Fee (amount + method) · Visit Notes (textarea after check-in) · Remove confirmation

**Business rules:**
- Realtime updates via Supabase channel on fm_visits and fm_payments for the selected date

---

### Holders Tab

**File:** `src/components/farmers-market/HoldersTab.jsx`

**Summary strip:** Active Holders (by stall type) · Outstanding Fees · At Risk count (red if > 0) · Total Holders

**Last market day summary:** Vendors attended · Collected (MWK) · No-shows

**At Risk banner:** Lists at_risk holders with "Mark Contacted" button and last_contacted date

**Filter tabs:** All · Pending Review · Active · At Risk · Inactive

**Columns:** Stall No · Name · Business · Type · Phone · Status · App Paid · Reg Fee Paid · Visits (YTD) · Outstanding · Actions

**Actions:**
- View / chevron — expands row to show contact details, payment history, visit history
- Edit — modal with all holder fields (manager only)
- QR Code — shows QR pointing to /checkin?holder={id}; Print and Download buttons (manager only)
- Approve — moves pending_review holder to accepted
- Deactivate — moves active/at_risk/accepted holder to inactive

**Business rules:**
- At-risk auto-flag: active holders registered >90 days ago with 0 visits in last 3 market days are automatically set to status=at_risk

---

### Add Holder Tab

**File:** `src/components/farmers-market/AddHolderTab.jsx`

**Form fields:** Full Name (required), Business Name, Stall Number (required, format A01 or FM01), Stall Type (required), Phone (required), Email, Notes

**Actions:** Add Holder button

**Business rules:**
- New holders created with status=pending_review, application_paid=false, acceptance_paid=false
- Stall number validated against regex /^[A-Za-z]+\d{2}$/ and checked for duplicates (case-insensitive, excluding inactive holders)
- Stall number auto-uppercased on blur
- Info message: application fee of MWK 10,000 must be logged separately in Payments tab

---

### Payments Tab

**File:** `src/components/farmers-market/PaymentsTab.jsx`

**Summary cards:** Total This Month · Application Fee total · Registration Fee total

**Payment form fields:** Holder (required, non-inactive only), Payment Type (Application/Registration), Amount (auto-filled from type, editable), Payment Date (required), Method (required), Reference, Notes

**Actions:** Record Payment button

**Payment history filters:** Holder · From Date · To Date · Clear

**Payment history columns:** Date · Holder · Stall No · Type · Amount · Method · Reference · Recorded By

**Business rules:**
- Recording Application Fee sets fm_holders.application_paid=true
- Recording Registration Fee sets fm_holders.acceptance_paid=true
- Visit fees are logged from the Market Day tab, not here

---

## Inventory Module

**File:** `src/pages/Inventory.jsx`  
**Access:** owner, manager, store_supervisor, bar1, bar2  
**Tabs:** Stock Levels · Log Delivery · Requisitions · Transfers · Adjustments · Delivery Log

---

### Stock Levels Tab

**File:** `src/components/inventory/StockLevelsTab.jsx`

**Controls:** Department filter dropdown

**Columns:** Item Name · SKU · Department · Unit · Current Stock · Reorder Level · Status (Low / OK badge)

**Business rules:** Read-only; "Low" badge if quantity ≤ reorder_level

---

### Log Delivery Tab

**File:** `src/components/inventory/LogDeliveryTab.jsx`  
**Access:** owner, manager, store_supervisor only

**Form fields:** Item (required), Quantity (required), Supplier (required), Date (required), Received By (required, staff dropdown), Notes, Logged By (read-only, current user)

**Actions:** Log Delivery button

**Behavior:** Inserts stock_movements row with movement_type=delivery; adds quantity to current_stock

---

### Requisitions Tab

**File:** `src/components/inventory/RequisitionsTab.jsx`

**Raise form fields:** Item (required), Department (auto-filled if user has a department), Quantity (required), Reason

**Actions:** Submit Requisition button

**Requisition list columns:** Item · Dept · Qty · Requested By (manager view only) · Reason · Date · Status · Actions (manager only)

**Manager actions:**
- Approve — moves status to approved
- Reject — moves status to rejected
- Fulfil — deducts quantity from stock, logs stock_movements row, moves status to fulfilled

**Business rules:**
- Non-managers see only their own requisitions
- Stock is deducted only on Fulfil, not on submission or approval

---

### Transfers Tab

**File:** `src/components/inventory/TransfersTab.jsx`  
**Access:** owner, manager, store_supervisor only

**Form fields:** Item (required), From Department (required), To Department (required), Quantity (required), Received By (required, staff dropdown), Notes, Transferred By (read-only, current user)

**Actions:** Record Transfer button

**Business rules:**
- From and To departments cannot be the same
- Creates two stock_movements rows (one negative, one positive); does not change central current_stock

---

### Adjustments Tab

**File:** `src/components/inventory/AdjustmentsTab.jsx`  
**Access:** owner, manager only

**Form fields:** Item (required), New Quantity (required, ≥ 0), Reason (required), Recorded By (read-only, current user); current stock shown after item selection

**Actions:** Record Adjustment button

**Behavior:** Calculates diff = new − current; creates stock_movements row with movement_type=adjustment; upserts current_stock; shows flash "Stock set to X (+/−Y)"

---

### Delivery Log Tab

**File:** `src/components/inventory/DeliveryLogTab.jsx`

**Filters:** Item · From Date · To Date · Clear

**Columns:** Date · Item · SKU · Quantity · Supplier · Performed By

**Business rules:** Shows only movement_type=delivery rows; Supplier extracted by parsing the notes field

---

## Table Bookings Module

**File:** `src/pages/TableBookings.jsx`  
**Access:** owner, manager, restaurant_manager, bar1, bar2, head_waiter, waiter  
**Tabs:** Today · Upcoming · New Booking · All Bookings

**Statuses:** pending · confirmed · seated · completed · cancelled · no_show  
**Locations:** Indoor · Outdoor · Terrace · Private Room

---

### Today Tab

**File:** `src/components/table-bookings/TodayTab.jsx`  
**Access (manage actions):** owner, manager, restaurant_manager only

**Controls:** Date picker (defaults to today) · "+ Walk In" button (manager only)

**Summary cards:** Total Covers · Confirmed · Seated · Completed · Cancelled · No Shows

**Columns:** Time · Guest Name · Party Size · Table · Status · Actions (manager only)

**Row highlighting:** Amber if potential no-show (confirmed booking >45 min past booking_time)

**Manager actions per booking:**
- pending → Confirm or Cancel
- confirmed → Seat, No Show, or Cancel
- seated → Complete

**Walk-in modal fields:** Guest Name (required), Phone (required), Party Size (defaults to 2), Table (optional, filtered by capacity ≥ party_size)

**Business rules:**
- Walk-ins created with status=seated immediately, booking_time set to current time
- Potential no-show: status=confirmed and booking_time is >45 min ago on today or a past date

---

### New Booking Tab

**File:** `src/components/table-bookings/NewBookingTab.jsx`  
**Access:** owner, manager, restaurant_manager only

**Form fields:** Guest Name (required), Email, Phone (required), Date (required), Time (required), Party Size (required), Table (optional), Special Requests, Notes

**Actions:** Create Booking button

**Business rules:**
- Created with status=pending; must be confirmed from Today tab
- Real-time conflict check: if table + date + time provided, warns if another confirmed/seated booking is within 45 min
- Party size cannot exceed table capacity

---

### Upcoming Tab

**File:** `src/components/table-bookings/UpcomingTab.jsx`

Displays future confirmed/pending bookings. Structure mirrors Today Tab with date filtering for upcoming dates.

---

### All Bookings Tab

**File:** `src/components/table-bookings/AllBookingsTab.jsx`

Historical and full booking list with filtering. Structure mirrors Today Tab across all dates and statuses.

---

## QR Check-in Page (Farmers Market)

**File:** `src/pages/CheckIn.jsx`  
**Access:** Public (no authentication required)  
**URL param:** `holder` (fm_holders.id)

**Data displayed:** Holder full name, business name, stall number, stall type, relevant market date, days until next market day

**Actions:** Check In button — creates fm_visits record with fee_paid=false

**Business rules:**
- Market day = last Saturday of the month
- Check-in only allowed within 1 day of the market day
- Duplicate check-in for the same holder on the same market day is blocked
- Displays "Already checked in" if a visit record already exists

---

## Cross-Module Business Rules Summary

| Rule | Where Applied |
|------|--------------|
| Stock deducted on Fulfil only (not submission/approval) | Inventory → Requisitions |
| Market day = last Saturday of month | Farmers Market throughout |
| "Mark All Absent" visible only after 11:00 | Attendance → Today Tab |
| Potential no-show flag after >45 min past booking time | Table Bookings → Today Tab |
| BEO checklists auto-generated on Confirm or Start Event | Events → Detail Tab |
| Deposit payment auto-sets deposit_paid on event | Events → Payments Section |
| At-risk flag auto-applied after 90 days with no visits | Farmers Market → Holders Tab |
| GPS outside lodge radius flags clock-in as unverified | Attendance → Clock In/Out |
| Bar Week required for bar1/bar2 roles only | Admin → Add User / Users Tab |
| Shift auto-selected if department has exactly one non-rotating shift | Admin → Add User / Users Tab |
