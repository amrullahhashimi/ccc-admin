-- Links a serial to the item it becomes in the connected Clover account.
--
-- Written idempotently on purpose: an earlier migration added this column on
-- some databases but its folder is no longer in version control, so the column
-- may or may not already be there. Adding it unconditionally would fail on the
-- databases that have it, and skipping it would break the ones that don't.

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ProductUnit'
    AND COLUMN_NAME = 'cloverItemId'
);

SET @sql := IF(
  @exists = 0,
  'ALTER TABLE `ProductUnit` ADD COLUMN `cloverItemId` VARCHAR(191) NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
