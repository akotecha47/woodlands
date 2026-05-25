-- add is_active to user_profiles for admin deactivation
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
