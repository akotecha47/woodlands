-- Replace the overly broad "FOR ALL USING (true)" policy with targeted
-- row-scoped policies so staff can only access their own records.
-- Manager/owner access to all rows goes through supabaseAdmin (service role)
-- which bypasses RLS entirely, so no separate manager SELECT policy is needed.

DROP POLICY IF EXISTS "authenticated can access attendance_records" ON attendance_records;

-- Any authenticated user can read their own attendance records
CREATE POLICY "users can read own attendance_records"
  ON attendance_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Any authenticated user can insert a record for themselves
CREATE POLICY "users can insert own attendance_records"
  ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
