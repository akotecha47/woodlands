-- 018_drop_dead_tables.sql
-- Remove tables that are no longer used after the staff restructure.

DROP TABLE IF EXISTS bar_week_config;
DROP TABLE IF EXISTS event_tasks;
DROP TABLE IF EXISTS fm_planning_tasks;
