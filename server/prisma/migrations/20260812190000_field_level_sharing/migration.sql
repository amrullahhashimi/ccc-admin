-- Sharing moves from three blanket switches on the store to field-by-field
-- grants on each share. The store that owns the data now picks the other shop
-- by staff email and ticks exactly what to hand over, so there is no directory
-- of store names to browse and no request/approval step.

-- Existing shares carry no grants until their owner ticks the boxes again;
-- nothing is silently handed over under the new model.
-- JSON columns can't carry a DEFAULT, so add it nullable, fill it, then pin it.
ALTER TABLE `StoreShare` ADD COLUMN `permissions` JSON NULL;
UPDATE `StoreShare` SET `permissions` = '{}' WHERE `permissions` IS NULL;
ALTER TABLE `StoreShare` MODIFY COLUMN `permissions` JSON NOT NULL;

ALTER TABLE `StoreShare` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `StoreShare` DROP COLUMN `status`;
ALTER TABLE `StoreShare` DROP COLUMN `respondedAt`;

ALTER TABLE `Store` DROP COLUMN `shareInventory`;
ALTER TABLE `Store` DROP COLUMN `shareVendors`;
ALTER TABLE `Store` DROP COLUMN `shareBrands`;
