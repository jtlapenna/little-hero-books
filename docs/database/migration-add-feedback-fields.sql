-- Migration: Add Feedback System Fields to Orders Table
-- Run this in Supabase SQL Editor to add regeneration feedback fields

-- Add new columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS qa_notes TEXT,
ADD COLUMN IF NOT EXISTS regeneration_attempt INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS regeneration_instructions TEXT,
ADD COLUMN IF NOT EXISTS quality_issues JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS previous_character_images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS rejection_history JSONB DEFAULT '[]'::jsonb;

-- Add index for regeneration queries
CREATE INDEX IF NOT EXISTS idx_orders_regeneration_attempt ON orders(regeneration_attempt);

-- Add index for orders needing regeneration
CREATE INDEX IF NOT EXISTS idx_orders_ai_generation_required ON orders(status) WHERE status = 'ai_generation_required';

-- Update existing orders to have default values
UPDATE orders 
SET 
    regeneration_attempt = 0,
    quality_issues = '[]'::jsonb,
    previous_character_images = '[]'::jsonb,
    rejection_history = '[]'::jsonb
WHERE regeneration_attempt IS NULL;

-- Add comment to document the fields
COMMENT ON COLUMN orders.qa_notes IS 'Human reviewer notes explaining why order was rejected';
COMMENT ON COLUMN orders.regeneration_attempt IS 'Number of times this order has been regenerated (0 = first attempt)';
COMMENT ON COLUMN orders.regeneration_instructions IS 'Detailed instructions for AI on how to fix issues in next generation';
COMMENT ON COLUMN orders.quality_issues IS 'Array of quality issue objects: [{category, description}]';
COMMENT ON COLUMN orders.previous_character_images IS 'Array of previous rejected character images for comparison';
COMMENT ON COLUMN orders.rejection_history IS 'Array of rejection records: [{attempt, rejected_at, rejected_by, categories, notes}]';

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN (
    'qa_notes',
    'regeneration_attempt',
    'regeneration_instructions',
    'quality_issues',
    'previous_character_images',
    'rejection_history'
)
ORDER BY column_name;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully! Feedback system fields added to orders table.';
END $$;

