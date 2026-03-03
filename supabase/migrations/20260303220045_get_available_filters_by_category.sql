CREATE OR REPLACE FUNCTION get_available_filters_by_category(p_category_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_category_id uuid;
BEGIN
  -- 1. Get the category ID by name (case insensitive match if needed, but exact is safer)
  SELECT id INTO v_category_id FROM categories WHERE name = p_category_name LIMIT 1;
  
  IF v_category_id IS NULL THEN
    RETURN json_build_object('brands', '[]'::json, 'colors', '[]'::json, 'sizes', '[]'::json);
  END IF;

  -- 2. Build the JSON object dynamically finding what is in stock
  SELECT json_build_object(
    'brands', COALESCE((
      SELECT json_agg(DISTINCT p.brand)
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE p.category_id = v_category_id 
        AND p.is_active = true 
        AND (i.quantity - i.reserved_qty) > 0 
        AND p.brand IS NOT NULL
    ), '[]'::json),
    'colors', COALESCE((
      SELECT json_agg(DISTINCT i.color)
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE p.category_id = v_category_id 
        AND p.is_active = true 
        AND (i.quantity - i.reserved_qty) > 0 
        AND i.color IS NOT NULL AND i.color != ''
    ), '[]'::json),
    'sizes', COALESCE((
      SELECT json_agg(DISTINCT i.size)
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE p.category_id = v_category_id 
        AND p.is_active = true 
        AND (i.quantity - i.reserved_qty) > 0 
        AND i.size IS NOT NULL AND i.size != ''
    ), '[]'::json)
  ) INTO result;
  
  RETURN result;
END;
$$;