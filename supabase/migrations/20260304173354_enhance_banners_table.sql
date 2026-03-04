-- Add new columns for enhanced banner management
ALTER TABLE banners 
  ADD COLUMN desktop_image_url TEXT,
  ADD COLUMN mobile_image_url TEXT,
  ADD COLUMN start_date TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN end_date TIMESTAMPTZ;

-- Migrate existing data: copy image_url to desktop_image_url
UPDATE banners 
SET desktop_image_url = image_url
WHERE desktop_image_url IS NULL;

-- Make desktop_image_url NOT NULL after migration
ALTER TABLE banners 
  ALTER COLUMN desktop_image_url SET NOT NULL;

-- Add comments
COMMENT ON COLUMN banners.desktop_image_url IS 'Banner image for desktop (1920x800px, 21:9)';
COMMENT ON COLUMN banners.mobile_image_url IS 'Banner image for mobile (800x1200px, 2:3). Optional - falls back to desktop if null';
COMMENT ON COLUMN banners.start_date IS 'Banner becomes active from this date';
COMMENT ON COLUMN banners.end_date IS 'Banner becomes inactive after this date (optional)';
