-- ═══════════════════════════════════════════════════════════════════════════
-- 063 — FARMERS MARKET PRODUCTS: REDESIGN TO A CUSTOMISABLE APPROVED LIST
-- 21 August 2026. DDL + money, on real client data (311 holders, 289 with
-- register text). Written on a base proven by §2.6 run 10 (001–062, PASSED).
-- ───────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
--
-- 061 built a fixed 3-level taxonomy (fm_categories › fm_product_types ›
-- fm_items) and classified holders by picking from it. On real data that model
-- did not survive contact: 311 of 311 holders sit on the deprecated
-- `stall_type = 'Other'`, only 50 of 311 ever got a `category_id`, and the
-- 51-item catalogue could not describe what these businesses actually sell
-- ("Mello nana chips- Banana chips with seasoning" is not in anybody's
-- taxonomy). Meanwhile the real answer was already in the database the whole
-- time: `fm_holders.products`, free text from the February 2026 register,
-- populated on 289 of 311 holders.
--
-- So: each business gets an APPROVED PRODUCTS LIST — free-text items, one row
-- each. The fixed taxonomy is retired rather than left dormant, because two
-- live product models is exactly how "Other: 311" happened.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE MONEY RULE, AND WHY IT IS SHAPED LIKE THIS
--
--   · The INITIAL list is free. Typing in (or correcting) what a business is
--     already confirmed to sell is not a change — it is the act of recording
--     the starting position. The backfill below IS that initial list, so
--     Dhiren merging "Crochetted Stuffed" + "toys and wall hangings" back into
--     one item at the walkthrough costs the stallholder nothing.
--   · Every edit AFTER the list exists raises the product_change fee PER ITEM
--     CHANGED, as SEPARATE fm_payments rows — three items changed is three
--     rows, not one row of 30,000. Separate rows because a fee is a charge
--     against a stallholder and each one has to be individually visible,
--     reversible and reconcilable in Payments.
--   · The amount is read from fm_fee_schedule INSIDE the same transaction as
--     the change, never from a constant. A fee that can be forgotten is the
--     exact failure FUNCTIONAL_SPEC §7 calls out.
--
--   COUNTING RULE: chargeable items = |added| + |removed|. A "replace" is not
--   a distinct database operation — the UI edits a list, so swapping A for B
--   IS one removal plus one addition, and it counts 2. This is the only rule
--   that cannot be gamed: if a replace counted 1, re-listing every item under
--   a new spelling would be cheaper than removing them. See the report — the
--   brief's "(add / remove / replace)" phrasing admits a reading where a
--   replace counts 1, and that reading is FLAGGED for confirmation rather than
--   silently chosen.
--
--   `products_set_at` on fm_holders is what makes "the initial list is free"
--   a STORED FACT rather than an inference from row count. Without it, an
--   owner could empty a holder's list (chargeable), then re-add everything and
--   have it read as a fresh, free, initial list.
--
-- ───────────────────────────────────────────────────────────────────────────
-- WHAT STEP 0 FOUND THAT THE PLAN DID NOT NAME (both handled below)
--
--   1. `v_fm_attendance` SELECTs fm_holders.category_id, so the column cannot
--      be dropped without rebuilding the view. It is dropped and recreated
--      here, security_invoker preserved.
--   2. `fm_waiting_list.category_id` is an FK to fm_categories and is
--      populated on 8 of 8 rows. Retiring the taxonomy forces its removal.
--      The waiting list already carries `products_note` free text — the same
--      shape as the new model — so that column absorbs the intent and the
--      FK column goes.
--
-- NO ANON ANYTHING. Asserted at the foot: anon gains no privilege on the new
-- table and no EXECUTE on the new function. 060 caught a PUBLIC/anon EXECUTE
-- default on exactly this pattern, which is why it is asserted, not assumed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PRE-FLIGHT ─────────────────────────────────────────────────────────────
-- Refuse to run if the database is not the one this migration was diagnosed
-- against. Better to abort than to backfill money rules onto a moved target.
DO $$
DECLARE
  v_holders   integer;
  v_withtext  integer;
  v_fee       numeric;
  v_stalltype integer;
BEGIN
  SELECT count(*) INTO v_holders  FROM public.fm_holders;
  SELECT count(*) INTO v_withtext FROM public.fm_holders
    WHERE products IS NOT NULL AND btrim(products) <> '';
  SELECT amount INTO v_fee FROM public.fm_fee_schedule
    WHERE fee_code = 'product_change' AND is_active;
  SELECT count(DISTINCT stall_type) INTO v_stalltype FROM public.fm_holders;

  IF v_holders <> 311 THEN
    RAISE EXCEPTION '063 PRE-FLIGHT: expected 311 holders, found %. Re-diagnose before running.', v_holders;
  END IF;
  IF v_withtext <> 289 THEN
    RAISE EXCEPTION '063 PRE-FLIGHT: expected 289 holders with register text, found %.', v_withtext;
  END IF;
  IF v_fee IS NULL THEN
    RAISE EXCEPTION '063 PRE-FLIGHT: no active product_change fee. The RPC below refuses to charge from a constant, so there is nothing to charge from.';
  END IF;

  RAISE NOTICE '063 pre-flight OK: % holders, % with register text, product_change fee MWK %, % distinct stall_type value(s).',
    v_holders, v_withtext, v_fee, v_stalltype;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. THE APPROVED PRODUCTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fm_holder_products (
  -- Stable row identity. The change diff works on item_name, but a row id is
  -- what lets a single item be pointed at in an audit or a support question.
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE matches fm_approved_items, the table this replaces: a deleted
  -- business does not leave orphaned product rows behind.
  holder_id  uuid NOT NULL REFERENCES public.fm_holders(id) ON DELETE CASCADE,

  -- The product, as the business describes it. Free text is the point of the
  -- redesign; the length cap is a typo guard, not a taxonomy in disguise (the
  -- longest real register item measured 45 characters).
  item_name  text NOT NULL,

  -- When this item joined the list, and who put it there. `added_by` is NULL
  -- for the backfill precisely because no human added those — they came from
  -- the February register, and pretending otherwise would forge an audit
  -- trail.
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   uuid REFERENCES auth.users(id),

  CONSTRAINT fm_holder_products_item_name_nonempty
    CHECK (btrim(item_name) <> ''),
  CONSTRAINT fm_holder_products_item_name_len
    CHECK (length(item_name) <= 200)
);

-- CASE-INSENSITIVE uniqueness per holder. The register already contains
-- "soup"/"Soup" and "tarts"/"Tarts" on one holder (A009), so this is a
-- measured need, not a hypothetical. It also stops a "change" being
-- manufactured by re-casing an item to trigger a fee.
CREATE UNIQUE INDEX IF NOT EXISTS fm_holder_products_holder_item_key
  ON public.fm_holder_products (holder_id, lower(btrim(item_name)));

CREATE INDEX IF NOT EXISTS fm_holder_products_holder_idx
  ON public.fm_holder_products (holder_id);

COMMENT ON TABLE public.fm_holder_products IS
  'One row per approved product per business. Free text by design (063) - replaces the fm_categories/fm_product_types/fm_items taxonomy and fm_approved_items, which 311 live holders could not be classified into. Written ONLY by change_holder_products(); there is deliberately no INSERT/UPDATE/DELETE grant for authenticated, so the product-change fee cannot be skipped by writing the table directly.';

COMMENT ON COLUMN public.fm_holder_products.added_by IS
  'NULL for the 063 backfill: those items came from the February 2026 register, not from a person using the app.';

-- ── RLS, in the same migration as the table (Standard §2.2) ────────────────
ALTER TABLE public.fm_holder_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access fm_holder_products" ON public.fm_holder_products;
CREATE POLICY "service role full access fm_holder_products"
  ON public.fm_holder_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fm_holder_products_manage_select ON public.fm_holder_products;
CREATE POLICY fm_holder_products_manage_select
  ON public.fm_holder_products FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('owner', 'admin'));

-- NO INSERT / UPDATE / DELETE POLICY FOR `authenticated`, AND NO SUCH GRANT.
-- This is deliberately STRICTER than fm_holders and stricter than the
-- fm_approved_items it replaces. fm_approved_items kept owner/admin INSERT and
-- DELETE policies against 061's own stated design that the RPC is the only
-- write path — logged as C-39 / D-7, "UI-only enforcement holds meanwhile".
-- UI-only enforcement of a money rule is not enforcement. Closing it by
-- construction here costs nothing, because the RPC is SECURITY DEFINER and
-- does not need the caller to hold the grant.
GRANT SELECT ON public.fm_holder_products TO authenticated;
GRANT ALL    ON public.fm_holder_products TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. THE "INITIAL LIST IS FREE" MARKER
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.fm_holders
  ADD COLUMN IF NOT EXISTS products_set_at timestamptz;

COMMENT ON COLUMN public.fm_holders.products_set_at IS
  'When this business first had an approved product list recorded. NULL = never set, so the next save is the free INITIAL list. Once stamped it is never cleared, which is what stops an emptied list from reading as a fresh free one.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. BACKFILL FROM THE FEBRUARY REGISTER
--
-- The agreed rule and nothing cleverer: split on ',', btrim, drop empties.
-- Case-insensitive de-duplication keeping the FIRST occurrence, because the
-- unique index above would otherwise reject A009's second "Tarts" and abort
-- the whole migration. That is a de-dup, not a smarter splitting rule.
--
-- Two register strings split in ways that are visibly wrong and are LEFT
-- WRONG on purpose, because inventing a rule to fix them would be overriding
-- client data (Standard §2.8):
--   A002 "Crochetted Stuffed, toys and wall hangings"
--        -> ["Crochetted Stuffed"] ["toys and wall hangings"]
--   A069 "Architectureal and design services, using local and natiral raw
--         materials, like bamboo and raw mud items and furniture"
--        -> three fragments of one sentence.
-- Both are corrected free at the walkthrough, which is the whole reason the
-- initial list carries no fee.
-- ═══════════════════════════════════════════════════════════════════════════
WITH split AS (
  SELECT h.id AS holder_id,
         btrim(x) AS item_name,
         ord
  FROM public.fm_holders h,
       LATERAL unnest(string_to_array(h.products, ',')) WITH ORDINALITY AS t(x, ord)
  WHERE h.products IS NOT NULL
    AND btrim(h.products) <> ''
    AND btrim(x) <> ''
),
deduped AS (
  SELECT DISTINCT ON (holder_id, lower(item_name))
         holder_id, item_name, ord
  FROM split
  ORDER BY holder_id, lower(item_name), ord
)
INSERT INTO public.fm_holder_products (holder_id, item_name, added_by)
SELECT holder_id, item_name, NULL
FROM deduped
ORDER BY holder_id, ord
ON CONFLICT DO NOTHING;

-- Stamp the marker for exactly those holders who now have a list. A holder
-- with no register text keeps products_set_at NULL, so their first save is
-- their free initial list.
UPDATE public.fm_holders h
SET products_set_at = now()
WHERE EXISTS (SELECT 1 FROM public.fm_holder_products p WHERE p.holder_id = h.id);

DO $$
DECLARE
  v_rows      integer;
  v_holders   integer;
  v_expected  integer;
  v_stamped   integer;
  v_missing   integer;
BEGIN
  SELECT count(*), count(DISTINCT holder_id) INTO v_rows, v_holders
  FROM public.fm_holder_products;

  SELECT count(*) INTO v_expected FROM public.fm_holders
  WHERE products IS NOT NULL AND btrim(products) <> '';

  SELECT count(*) INTO v_stamped FROM public.fm_holders WHERE products_set_at IS NOT NULL;

  -- THE invariant: every holder with register text got at least one item.
  -- A silent partial backfill is the failure mode that matters here.
  SELECT count(*) INTO v_missing
  FROM public.fm_holders h
  WHERE h.products IS NOT NULL AND btrim(h.products) <> ''
    AND NOT EXISTS (SELECT 1 FROM public.fm_holder_products p WHERE p.holder_id = h.id);

  IF v_missing > 0 THEN
    RAISE EXCEPTION '063 BACKFILL: % holder(s) have register text but no product rows. Rolling back.', v_missing;
  END IF;
  IF v_holders <> v_expected THEN
    RAISE EXCEPTION '063 BACKFILL: % holders covered, expected %. Rolling back.', v_holders, v_expected;
  END IF;
  IF v_stamped <> v_expected THEN
    RAISE EXCEPTION '063 BACKFILL: % holders stamped products_set_at, expected %.', v_stamped, v_expected;
  END IF;

  RAISE NOTICE '063 backfill: % item rows across % holders (all % with register text covered); % stamped as having an initial list.',
    v_rows, v_holders, v_expected, v_stamped;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. change_holder_products() — DROP, THEN CREATE. NEVER OVERLOAD.
--
-- The old signature is (uuid, uuid[], uuid, text, text, text) and is built on
-- the taxonomy being dropped below. Overloading would leave two functions with
-- the same name resolving on argument type — the exact ambiguity the
-- DROP-before-replace rule exists to prevent.
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.change_holder_products(uuid, uuid[], uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.change_holder_products(
  p_holder_id      uuid,
  p_item_names     text[],
  p_payment_method text DEFAULT 'cash',
  p_reference      text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role      text;
  v_holder    public.fm_holders%ROWTYPE;
  v_fee       public.fm_fee_schedule%ROWTYPE;
  v_is_initial boolean;
  v_incoming  text[];
  v_added     text[];
  v_removed   text[];
  v_n_added   integer;
  v_n_removed integer;
  v_n_charged integer;
  v_total     numeric := 0;
  v_item      text;
  v_payments  uuid[] := '{}';
  v_pid       uuid;
BEGIN
  IF p_holder_id IS NULL THEN
    RAISE EXCEPTION 'change_holder_products: holder is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── who ─────────────────────────────────────────────────────────────────
  v_role := public.current_app_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'change_holder_products: no active profile for this user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'change_holder_products: % is not permitted to change approved products', v_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_holder FROM public.fm_holders WHERE id = p_holder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_holder_products: no such holder %', p_holder_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN
     ('cash', 'bank_transfer', 'tnm_mpamba', 'airtel_money') THEN
    RAISE EXCEPTION 'change_holder_products: % is not a valid payment method', p_payment_method
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the incoming list, normalised the same way the table stores it ──────
  -- Held in an ARRAY, not a temp table. A `CREATE TEMP TABLE ... ON COMMIT
  -- DROP` here would break the SECOND call inside one transaction, because
  -- ON COMMIT DROP does not fire until commit — which is exactly what the
  -- rolled-back dry run does, and what any future caller changing two holders
  -- in one transaction would do.
  SELECT coalesce(array_agg(item_name ORDER BY ord), '{}')
  INTO v_incoming
  FROM (
    SELECT DISTINCT ON (lower(btrim(x))) btrim(x) AS item_name, ord
    FROM unnest(coalesce(p_item_names, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
    WHERE btrim(x) <> ''
    ORDER BY lower(btrim(x)), ord
  ) q;

  IF EXISTS (SELECT 1 FROM unnest(v_incoming) AS u WHERE length(u) > 200) THEN
    RAISE EXCEPTION 'change_holder_products: an item name exceeds 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- An empty list is only legitimate as a deliberate clear-out, never as the
  -- initial state, so it is refused when there is nothing to clear.
  IF coalesce(array_length(v_incoming, 1), 0) = 0
     AND NOT EXISTS (SELECT 1 FROM public.fm_holder_products WHERE holder_id = p_holder_id) THEN
    RAISE EXCEPTION 'change_holder_products: at least one product must be listed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── the per-item diff, case-insensitively ───────────────────────────────
  SELECT coalesce(array_agg(u ORDER BY u), '{}')
  INTO v_added
  FROM unnest(v_incoming) AS u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fm_holder_products p
    WHERE p.holder_id = p_holder_id
      AND lower(btrim(p.item_name)) = lower(btrim(u))
  );

  SELECT coalesce(array_agg(p.item_name ORDER BY p.item_name), '{}')
  INTO v_removed
  FROM public.fm_holder_products p
  WHERE p.holder_id = p_holder_id
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_incoming) AS u
      WHERE lower(btrim(u)) = lower(btrim(p.item_name))
    );
  v_n_added   := coalesce(array_length(v_added, 1), 0);
  v_n_removed := coalesce(array_length(v_removed, 1), 0);

  -- ── nothing changed: no writes, no fee ──────────────────────────────────
  IF v_n_added = 0 AND v_n_removed = 0 THEN
    RETURN jsonb_build_object(
      'changed',      false,
      'initial',      false,
      'fee_raised',   false,
      'items_added',   0,
      'items_removed', 0,
      'items_charged', 0,
      'fee_total',     0,
      'holder_id',    p_holder_id,
      'message',      'No change to the approved product list - no fee raised.'
    );
  END IF;

  -- ── is this the free initial list? ──────────────────────────────────────
  -- Read from the STORED marker, never inferred from "the list is empty".
  v_is_initial := (v_holder.products_set_at IS NULL);

  -- ── apply the change ────────────────────────────────────────────────────
  DELETE FROM public.fm_holder_products
  WHERE holder_id = p_holder_id
    AND lower(btrim(item_name)) IN (
      SELECT lower(btrim(u)) FROM unnest(v_removed) AS u
    );

  INSERT INTO public.fm_holder_products (holder_id, item_name, added_by)
  SELECT p_holder_id, u, auth.uid()
  FROM unnest(v_added) AS u;

  IF v_is_initial THEN
    UPDATE public.fm_holders SET products_set_at = now() WHERE id = p_holder_id;
  END IF;

  -- ── the fee ─────────────────────────────────────────────────────────────
  IF v_is_initial THEN
    RETURN jsonb_build_object(
      'changed',      true,
      'initial',      true,
      'fee_raised',   false,
      'items_added',   v_n_added,
      'items_removed', v_n_removed,
      'items_charged', 0,
      'fee_total',     0,
      'holder_id',    p_holder_id,
      'holder_name',  v_holder.full_name,
      'message',      'Initial approved product list recorded - no fee.'
    );
  END IF;

  -- From the schedule, in this transaction. Never a constant.
  SELECT * INTO v_fee
  FROM public.fm_fee_schedule
  WHERE fee_code = 'product_change' AND is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_holder_products: no active product_change fee in fm_fee_schedule - refusing to make a product change that raises no fee'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ONE ROW PER ITEM CHANGED. Not one row of n x fee: each charge has to be
  -- individually visible, reversible and reconcilable on the Payments screen.
  v_n_charged := v_n_added + v_n_removed;

  FOREACH v_item IN ARRAY (v_added || v_removed) LOOP
    INSERT INTO public.fm_payments (
      holder_id, payment_type, amount, payment_date, payment_method,
      reference, recorded_by, notes
    ) VALUES (
      p_holder_id, 'product_change', v_fee.amount, current_date, p_payment_method,
      p_reference, auth.uid(),
      coalesce(p_notes || ' | ', '') || 'Product change (063): ' ||
      CASE WHEN v_item = ANY(v_added) THEN 'added ' ELSE 'removed ' END || v_item
    )
    RETURNING id INTO v_pid;
    v_payments := v_payments || v_pid;
    v_total := v_total + v_fee.amount;
  END LOOP;

  RETURN jsonb_build_object(
    'changed',       true,
    'initial',       false,
    'fee_raised',    true,
    'items_added',   v_n_added,
    'items_removed', v_n_removed,
    'items_charged', v_n_charged,
    'fee_code',      v_fee.fee_code,
    'fee_each',      v_fee.amount,
    'fee_total',     v_total,
    'holder_id',     p_holder_id,
    'holder_name',   v_holder.full_name,
    'added',         to_jsonb(v_added),
    'removed',       to_jsonb(v_removed),
    'payment_ids',   to_jsonb(v_payments)
  );
END;
$$;

-- REVOKE FIRST, then grant to exactly the one role. 060 caught a real
-- PUBLIC/anon EXECUTE default on this pattern; the assertion at the foot is
-- what proves it stayed fixed.
REVOKE ALL ON FUNCTION public.change_holder_products(uuid, text[], text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.change_holder_products(uuid, text[], text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_holder_products(uuid, text[], text, text, text) TO authenticated;

COMMENT ON FUNCTION public.change_holder_products(uuid, text[], text, text, text) IS
  'Replaces a business approved product list and raises the product_change fee PER ITEM CHANGED (|added| + |removed|), one fm_payments row each, amount read live from fm_fee_schedule in the same transaction. The FIRST list a holder ever gets is free - decided by fm_holders.products_set_at, not by the list being empty. Gated owner/admin; the only write path to fm_holder_products.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. REBUILD v_fm_attendance WITHOUT category_id
--
-- Found in Step 0: the view SELECTs fm_holders.category_id, so the column
-- cannot be dropped underneath it. Dropped and recreated identically except
-- for that one column. security_invoker is re-stated explicitly — dropping a
-- view drops its reloptions with it, and a view that silently reverted to
-- definer rights would hand every caller the owner's visibility.
-- ═══════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.v_fm_attendance;

CREATE VIEW public.v_fm_attendance
WITH (security_invoker = true) AS
WITH md AS (
  SELECT t.d AS market_date,
         row_number() OVER (ORDER BY t.d DESC) AS recency
  FROM public.fm_last_n_market_days(3) t(d)
), grid AS (
  SELECT h.id AS holder_id,
         h.stall_number,
         h.full_name,
         h.business_name,
         h.status,
         h.created_at,
         md.market_date,
         md.recency,
         v.id IS NOT NULL AS attended,
         COALESCE(v.fee_paid, false) AS fee_paid,
         v.checked_in_at
  FROM public.fm_holders h
  CROSS JOIN md
  LEFT JOIN public.fm_visits v ON v.holder_id = h.id AND v.visit_date = md.market_date
)
SELECT holder_id,
       stall_number,
       full_name,
       business_name,
       status,
       market_date,
       recency,
       attended,
       fee_paid,
       checked_in_at,
       count(*) FILTER (WHERE attended) OVER (PARTITION BY holder_id) AS attended_count,
       count(*) FILTER (WHERE NOT attended) OVER (PARTITION BY holder_id) AS missed_count,
       (SELECT max(v2.visit_date) FROM public.fm_visits v2 WHERE v2.holder_id = g.holder_id) AS last_visit_date,
       (status = ANY (ARRAY['active'::text, 'at_risk'::text]))
         AND count(*) FILTER (WHERE attended) OVER (PARTITION BY holder_id) = 0
         AND created_at::date < (SELECT min(m2.market_date) FROM md m2) AS forfeit_eligible
FROM grid g;

GRANT SELECT ON public.v_fm_attendance TO authenticated;
GRANT SELECT ON public.v_fm_attendance TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RETIRE THE TAXONOMY
--
-- Order matters: dependents first, then the columns that FK into them, then
-- the tables. Every one of these was confirmed in Step 0 to have no other
-- reader that is not rewritten in this same block.
-- ═══════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS public.fm_approved_items;

DROP INDEX IF EXISTS public.fm_holders_category_idx;
ALTER TABLE public.fm_holders      DROP COLUMN IF EXISTS category_id;

-- Step 0 finding (2): 8 of 8 waiting-list rows carry a category_id FK. The
-- table already has `products_note` free text, which is the new model's shape,
-- so the intent survives and the FK column goes.
ALTER TABLE public.fm_waiting_list DROP COLUMN IF EXISTS category_id;

DROP TABLE IF EXISTS public.fm_items;
DROP TABLE IF EXISTS public.fm_product_types;
DROP TABLE IF EXISTS public.fm_categories;

COMMENT ON COLUMN public.fm_waiting_list.products_note IS
  'Free text: what this applicant intends to sell. Since 063 this is the only product field on the waiting list - the fm_categories FK it sat beside was retired with the taxonomy.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. DROP stall_type
--
-- NOT NULL, no default, 'Other' on 311 of 311 rows, and Step 0 confirmed its
-- ONLY dependency in the whole catalogue is its own CHECK — no view, no
-- function, no policy, no index. It has been deprecated in place since 061
-- because dropping a NOT NULL column is DDL and 061 was not the place; this
-- is the place.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.fm_holders DROP CONSTRAINT IF EXISTS fm_holders_stall_type_check;
ALTER TABLE public.fm_holders DROP COLUMN IF EXISTS stall_type;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. POST-FLIGHT ASSERTIONS
-- Everything this migration claims, re-measured. A migration that reports
-- success without checking is a migration that has not been tested.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_left      integer;
  v_anon      integer;
  v_anon_exec boolean;
  v_pub_exec  boolean;
  v_sigs      integer;
  v_acl       text;
  v_rows      integer;
  v_holders   integer;
  v_secinv    text;
  v_pol_write integer;
BEGIN
  -- 1. the taxonomy is gone, and so are the two doomed columns
  SELECT count(*) INTO v_left
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('fm_categories','fm_product_types','fm_items','fm_approved_items');
  IF v_left <> 0 THEN
    RAISE EXCEPTION '063 POST: % taxonomy table(s) survive.', v_left;
  END IF;

  SELECT count(*) INTO v_left
  FROM information_schema.columns
  WHERE table_schema='public'
    AND ((table_name='fm_holders'      AND column_name IN ('category_id','stall_type'))
      OR (table_name='fm_waiting_list' AND column_name = 'category_id'));
  IF v_left <> 0 THEN
    RAISE EXCEPTION '063 POST: % retired column(s) survive.', v_left;
  END IF;

  -- 2. NO ANON WIDENING on the new table
  SELECT count(*) INTO v_anon
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='fm_holder_products' AND grantee='anon'
    AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');
  IF v_anon <> 0 THEN
    RAISE EXCEPTION '063 POST: anon holds % DML privilege(s) on fm_holder_products.', v_anon;
  END IF;

  -- 3. authenticated may READ but NOT WRITE the table directly: the RPC is the
  --    only write path, which is what makes the fee unskippable.
  SELECT count(*) INTO v_pol_write
  FROM pg_policies
  WHERE schemaname='public' AND tablename='fm_holder_products'
    AND 'authenticated' = ANY(roles) AND cmd <> 'SELECT';
  IF v_pol_write <> 0 THEN
    RAISE EXCEPTION '063 POST: % write policy(ies) for authenticated on fm_holder_products - the fee becomes skippable.', v_pol_write;
  END IF;

  SELECT count(*) INTO v_left
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='fm_holder_products'
    AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF v_left <> 0 THEN
    RAISE EXCEPTION '063 POST: authenticated holds % direct write grant(s) on fm_holder_products.', v_left;
  END IF;

  -- 4. the function: one signature, right ACL, no anon/PUBLIC EXECUTE
  SELECT count(*) INTO v_sigs
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='change_holder_products';
  IF v_sigs <> 1 THEN
    RAISE EXCEPTION '063 POST: % signatures of change_holder_products - the old one was not dropped.', v_sigs;
  END IF;

  SELECT has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('public', p.oid, 'EXECUTE'),
         coalesce(array_to_string(p.proacl, ','), 'NULL')
  INTO v_anon_exec, v_pub_exec, v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='change_holder_products';

  IF v_anon_exec OR v_pub_exec THEN
    RAISE EXCEPTION '063 POST: change_holder_products EXECUTE - anon=%, public=%. Must be false on both.',
      v_anon_exec, v_pub_exec;
  END IF;

  -- 5. the view came back as security_invoker
  SELECT coalesce((SELECT o FROM unnest(c.reloptions) o WHERE o LIKE 'security_invoker%'), 'UNSET')
  INTO v_secinv
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='v_fm_attendance';
  IF v_secinv <> 'security_invoker=true' THEN
    RAISE EXCEPTION '063 POST: v_fm_attendance is % - it must be security_invoker=true.', v_secinv;
  END IF;

  -- 6. the data survived
  SELECT count(*), count(DISTINCT holder_id) INTO v_rows, v_holders
  FROM public.fm_holder_products;

  RAISE NOTICE '063 POST OK: taxonomy retired, stall_type and both category_id columns dropped; fm_holder_products holds % rows across % holders; anon has no DML and no EXECUTE; authenticated is SELECT-only on the table; change_holder_products has 1 signature, proacl=%; v_fm_attendance is %.',
    v_rows, v_holders, v_acl, v_secinv;
END $$;
