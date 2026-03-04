-- fix(rpc): filter options now only show items with available stock

CREATE OR REPLACE FUNCTION get_available_filters_by_category(p_category TEXT)
RETURNS TABLE(brands TEXT[], colors TEXT[], sizes TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Marcas únicas de productos con AL MENOS 1 unidad en stock
    COALESCE(
      ARRAY_AGG(DISTINCT p.brand) FILTER (WHERE p.brand IS NOT NULL AND p.brand != ''),
      ARRAY[]::TEXT[]
    ) AS brands,
    
    -- Colores únicos de productos con AL MENOS 1 unidad en stock
    COALESCE(
      ARRAY_AGG(DISTINCT p.color) FILTER (WHERE p.color IS NOT NULL AND p.color != ''),
      ARRAY[]::TEXT[]
    ) AS colors,
    
    -- Tallas únicas QUE TENGAN STOCK DISPONIBLE en inventory
    COALESCE(
      ARRAY_AGG(DISTINCT i.size) FILTER (WHERE i.size IS NOT NULL AND i.size != ''),
      ARRAY[]::TEXT[]
    ) AS sizes
  FROM products p
  INNER JOIN inventory i ON p.id = i.product_id
  WHERE 
    p.is_active = true
    AND p.published_to_landing = true
    -- Filtro por categoría (si se especifica)
    AND (p_category IS NULL OR p.category_id = (
      SELECT c.id FROM categories c WHERE c.name = p_category LIMIT 1
    ))
    -- CRÍTICO: Solo contar filas de inventory con stock positivo
    AND (i.quantity - COALESCE(i.reserved_qty, 0)) > 0;
END;
$$;