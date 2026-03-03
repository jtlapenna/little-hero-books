-- Orders table: which columns are never (or rarely) populated?
-- Run this in your Little Hero Books Supabase project: SQL Editor → New query → paste → Run.
-- Requires table "orders" in public schema.

DROP TABLE IF EXISTS _orders_column_population;
CREATE TEMP TABLE _orders_column_population (
  column_name text,
  data_type text,
  total_rows bigint,
  populated_count bigint,
  pct_populated numeric,
  never_populated boolean
);

DO $$
DECLARE
  total bigint;
  col record;
  pop_count bigint;
BEGIN
  SELECT count(*) INTO total FROM orders;

  FOR col IN
    SELECT c.column_name, c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'orders'
    ORDER BY c.ordinal_position
  LOOP
    EXECUTE format('SELECT count(*) FROM orders WHERE %I IS NOT NULL', col.column_name) INTO pop_count;

    INSERT INTO _orders_column_population (column_name, data_type, total_rows, populated_count, pct_populated, never_populated)
    VALUES (
      col.column_name,
      col.data_type,
      total,
      pop_count,
      round(100.0 * pop_count / NULLIF(total, 0), 2),
      (pop_count = 0)
    );
  END LOOP;
END $$;

-- 1) Columns that are NEVER populated (0 rows with non-null value)
SELECT 'Never populated' AS report, column_name, data_type, total_rows, populated_count, pct_populated
FROM _orders_column_population
WHERE never_populated
ORDER BY column_name;

-- 2) Rarely populated (< 10% of rows) — uncomment to run
-- SELECT 'Rarely populated (<10%)' AS report, column_name, data_type, total_rows, populated_count, pct_populated
-- FROM _orders_column_population
-- WHERE pct_populated < 10 AND total_rows > 0
-- ORDER BY pct_populated ASC, column_name;

-- 3) Full list sorted by population rate (lowest first) — uncomment to run
-- SELECT column_name, data_type, total_rows, populated_count, pct_populated
-- FROM _orders_column_population
-- ORDER BY pct_populated ASC NULLS LAST, column_name;
