-- DEPRECATED: this recipe confused Supabase authenticated users with LHL admins.
-- LHL admins use Cloudflare Access. All database order access is server-only.
-- Apply the reviewed database/20261018042623_lhl_private_order_boundaries.sql
-- through the coordinated migration process; never grant browser roles orders.
DO $$ BEGIN
  RAISE EXCEPTION 'Deprecated insecure admin-permissions recipe. Use the reviewed private-order-boundaries migration.';
END $$;
