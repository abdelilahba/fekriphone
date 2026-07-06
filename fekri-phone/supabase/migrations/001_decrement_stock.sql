-- ============================================================
--  FekriPhone — Migration: decrement_stock RPC function
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Atomically decrements stock for a product.
-- Uses GREATEST(0, ...) to prevent stock from going negative.
-- SECURITY DEFINER allows it to be called from the client safely.
CREATE OR REPLACE FUNCTION decrement_stock(p_id uuid, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE produits
  SET
    quantite   = GREATEST(0, quantite - p_qty),
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrement_stock(uuid, integer) TO authenticated;
