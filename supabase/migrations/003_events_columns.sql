-- events: event categorisation, table count, when balance payment is due
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_type       text,
  ADD COLUMN IF NOT EXISTS tables_required  integer,
  ADD COLUMN IF NOT EXISTS balance_due_date date;

-- event_tasks: which department owns the task, who completed it
ALTER TABLE event_tasks
  ADD COLUMN IF NOT EXISTS department   text,
  ADD COLUMN IF NOT EXISTS completed_by text;

-- event_payments: distinguish deposit from balance payment
ALTER TABLE event_payments
  ADD COLUMN IF NOT EXISTS payment_type text;
