Project: Woodlands Lodge Management System
Client: Woodlands Lodge, Lilongwe, Malawi
Stack: React + Vite + Tailwind + Supabase + Vercel
Repo: github.com/akotecha47/woodlands
Live: woodlands-beta.vercel.app
Supabase URL: https://gttsjmxltrxxfplqjans.supabase.co

Modules: Inventory, Attendance, Events, Table Bookings, Farmers Market
Users: owner, manager, store_supervisor, bar1, bar2, restaurant_manager
Auth: Supabase Auth + user_profiles table (role as plain text, department as plain text)

Rules:
- All department references are plain text, never FK to a departments table
- Stock deducted on requisition APPROVAL only, not on submission
- No biometrics in this phase — manual clock in/out only
- Do not re-read all files on session start
