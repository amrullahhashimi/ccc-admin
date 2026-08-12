-- The master account administers the whole system and belongs to no store, so
-- a user's store becomes optional. Everyone else still has one.
ALTER TABLE `User` MODIFY COLUMN `storeId` VARCHAR(191) NULL;
