-- Per-event setup/operational details — service style, furniture, stage,
-- conference setup, cake cutting, drinks menu, food notes, and a catch-all.
-- One row per event (enforced by UNIQUE on event_id).

CREATE TABLE event_configurations (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  service_style          text,
  service_style_other    text,
  furniture_layout       text,
  stage_required         boolean     DEFAULT false,
  stage_notes            text,
  conference_setup       text,
  conference_setup_other text,
  cake_cutting_table     boolean     DEFAULT false,
  cake_cutting_notes     text,
  drinks_menu            text,
  food_notes             text,
  other_setup            text,
  created_by             uuid        REFERENCES auth.users(id),
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  UNIQUE (event_id)
);

ALTER TABLE event_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_event_configurations"
  ON event_configurations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON event_configurations TO service_role;
