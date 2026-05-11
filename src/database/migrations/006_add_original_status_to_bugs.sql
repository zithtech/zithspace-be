-- Add original_status column to bugs table
-- This preserves the original status when bugs are moved to trash
-- so they can be restored to their correct status

ALTER TABLE bugs 
ADD COLUMN original_status VARCHAR(20) DEFAULT NULL;

-- Add index for better performance on restore operations
CREATE INDEX idx_bugs_original_status ON bugs(original_status);

-- Add comment explaining the purpose
COMMENT ON COLUMN bugs.original_status IS 'Stores the original status before bug was moved to trash, used for restoration';
