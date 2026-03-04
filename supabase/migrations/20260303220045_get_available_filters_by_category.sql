-- fix(rpc): filter options now only show items with available stock

CREATE OR REPLACE FUNCTION get_available_filters_by_category(p_category TEXT)
RETURNS TABLE(brands TEXT[], colors TEXT[], sizes TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH products_with_stock AS (
    SELECT DISTINCT
      p.id,
      p.brand,
      p.color,
      p.sizes,
      p.category_id
    FROM products p
    INNER JOIN inventory i ON p.id = i.product_id
    WHERE 
      p.is_active = true
      AND p.published_to_landing = true
      AND (p_category IS NULL OR p.category_id = (
        SELECT c.id FROM categories c WHERE c.name = p_category LIMIT 1
      ))
      -- Solo productos con stock disponible
      AND (i.quantity - COALESCE(i.reserved_qty, 0)) > 0
  )
  SELECT
    -- Marcas únicas de productos con stock
    COALESCE(
      ARRAY_AGG(DISTINCT p_s.brand) FILTER (WHERE p_s.brand IS NOT NULL AND p_s.brand != ''),
      ARRAY[]::TEXT[]
    ) AS brands,
    
    -- Colores únicos de productos con stock
    COALESCE(
      ARRAY_AGG(DISTINCT p_s.color) FILTER (WHERE p_s.color IS NOT NULL AND p_s.color != ''),
      ARRAY[]::TEXT[]
    ) AS colors,
    
    -- Tallas únicas de productos con stock
    COALESCE(
      ARRAY_AGG(DISTINCT size_elem) FILTER (WHERE size_elem IS NOT NULL AND size_elem != ''),
      ARRAY[]::TEXT[]
    ) AS sizes
  FROM products_with_stock p_s
  CROSS JOIN LATERAL unnest(COALESCE(p_s.sizes, ARRAY[]::TEXT[])) AS size_elem;
END;
$$;