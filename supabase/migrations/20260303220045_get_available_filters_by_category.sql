-- fix(rpc): correct color column reference from inventory.color to products.color
-- Also changes signature to RETURNS TABLE for better type safety and adds support for NULL category (all products)

CREATE OR REPLACE FUNCTION get_available_filters_by_category(p_category TEXT)
RETURNS TABLE(brands TEXT[], colors TEXT[], sizes TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- brands: aggregated from products.brand
    COALESCE(
      ARRAY_AGG(DISTINCT p.brand) FILTER (WHERE p.brand IS NOT NULL AND p.brand != ''),
      ARRAY[]::TEXT[]
    ) AS brands,

    -- colors: from products.color (TEXT singular) — NOT inventory.color
    COALESCE(
      ARRAY_AGG(DISTINCT p.color) FILTER (WHERE p.color IS NOT NULL AND p.color != ''),
      ARRAY[]::TEXT[]
    ) AS colors,

    -- sizes: from products.sizes (TEXT[] array) — unnested
    COALESCE(
      ARRAY_AGG(DISTINCT size_elem) FILTER (WHERE size_elem IS NOT NULL AND size_elem != ''),
      ARRAY[]::TEXT[]
    ) AS sizes

  FROM products p
  CROSS JOIN LATERAL unnest(COALESCE(p.sizes, ARRAY[]::TEXT[])) AS size_elem
  WHERE
    p.is_active = true
    AND p.published_to_landing = true
    AND (p_category IS NULL OR p.category_id = (
      SELECT id FROM categories WHERE name = p_category LIMIT 1
    ));
END;
$$;