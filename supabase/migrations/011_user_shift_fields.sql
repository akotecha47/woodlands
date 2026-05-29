ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS shift_name text,
  ADD COLUMN IF NOT EXISTS bar_week   text CHECK (bar_week IN ('A','B'));
