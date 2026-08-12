-- Multi-store: every record now belongs to exactly one shop.
--
-- Your existing data is moved into a first store, so nothing is lost and the
-- app keeps behaving as it did. Names that used to be unique across the whole
-- database (vendor, brand, location, SKU, serial, ticket/sale numbers) become
-- unique per store instead, so two shops can both have "Apple" or a ticket #1.

-- ---------------------------------------------------------------- stores ---

CREATE TABLE `Store` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `logo` LONGTEXT NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `serviceTerms` TEXT NULL,
    `labelWidthMm` INTEGER NOT NULL DEFAULT 50,
    `labelHeightMm` INTEGER NOT NULL DEFAULT 25,
    `shareInventory` BOOLEAN NOT NULL DEFAULT false,
    `shareVendors` BOOLEAN NOT NULL DEFAULT false,
    `shareBrands` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StoreShare` (
    `id` VARCHAR(191) NOT NULL,
    `ownerStoreId` VARCHAR(191) NOT NULL,
    `viewerStoreId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,

    UNIQUE INDEX `StoreShare_ownerStoreId_viewerStoreId_key`(`ownerStoreId`, `viewerStoreId`),
    INDEX `StoreShare_viewerStoreId_idx`(`viewerStoreId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StoreShare` ADD CONSTRAINT `StoreShare_ownerStoreId_fkey` FOREIGN KEY (`ownerStoreId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StoreShare` ADD CONSTRAINT `StoreShare_viewerStoreId_fkey` FOREIGN KEY (`viewerStoreId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- The shop that already exists. Everything below is handed to it.
INSERT INTO `Store` (`id`, `name`, `createdAt`, `updatedAt`)
VALUES ('store_primary', 'Canadian Cellular Communication', NOW(3), NOW(3));

-- ------------------------------------------------- drop the basic-user bits ---
-- Replaced by store ownership; per-user ownership is gone.

ALTER TABLE `Vendor` DROP FOREIGN KEY `Vendor_createdById_fkey`;
DROP INDEX `Vendor_createdById_idx` ON `Vendor`;
ALTER TABLE `Vendor` DROP COLUMN `createdById`;

ALTER TABLE `Product` DROP FOREIGN KEY `Product_createdById_fkey`;
DROP INDEX `Product_createdById_idx` ON `Product`;
ALTER TABLE `Product` DROP COLUMN `createdById`;

-- Any account left on the retired BASIC role becomes ordinary staff.
UPDATE `User` SET `role` = 'STAFF' WHERE `role` = 'BASIC';

-- ------------------------------------------------------- add storeId cols ---

ALTER TABLE `User` ADD COLUMN `storeId` VARCHAR(191) NULL, ADD COLUMN `superAdmin` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Location` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Category` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Vendor` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Brand` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Product` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `ProductUnit` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Customer` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Ticket` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Sale` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Layaway` ADD COLUMN `storeId` VARCHAR(191) NULL;
ALTER TABLE `Invoice` ADD COLUMN `storeId` VARCHAR(191) NULL;

UPDATE `User` SET `storeId` = 'store_primary';
UPDATE `Location` SET `storeId` = 'store_primary';
UPDATE `Category` SET `storeId` = 'store_primary';
UPDATE `Vendor` SET `storeId` = 'store_primary';
UPDATE `Brand` SET `storeId` = 'store_primary';
UPDATE `Product` SET `storeId` = 'store_primary';
UPDATE `ProductUnit` SET `storeId` = 'store_primary';
UPDATE `Customer` SET `storeId` = 'store_primary';
UPDATE `Ticket` SET `storeId` = 'store_primary';
UPDATE `Sale` SET `storeId` = 'store_primary';
UPDATE `Layaway` SET `storeId` = 'store_primary';
UPDATE `Invoice` SET `storeId` = 'store_primary';

-- Whoever owns the shop today runs the whole system.
UPDATE `User` SET `superAdmin` = true WHERE `role` = 'OWNER';

-- Now that every row has one, the column is required.
ALTER TABLE `User` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Location` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Category` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Vendor` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Brand` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Product` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `ProductUnit` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Customer` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Ticket` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Sale` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Layaway` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;
ALTER TABLE `Invoice` MODIFY COLUMN `storeId` VARCHAR(191) NOT NULL;

-- ------------------------------------ names are unique per store, not global ---

DROP INDEX `Location_name_key` ON `Location`;
DROP INDEX `Vendor_name_key` ON `Vendor`;
DROP INDEX `Brand_name_key` ON `Brand`;
DROP INDEX `Product_sku_key` ON `Product`;
DROP INDEX `ProductUnit_serial_key` ON `ProductUnit`;
DROP INDEX `Ticket_number_key` ON `Ticket`;
DROP INDEX `Sale_number_key` ON `Sale`;
DROP INDEX `Layaway_number_key` ON `Layaway`;
DROP INDEX `Invoice_number_key` ON `Invoice`;

CREATE UNIQUE INDEX `Location_storeId_name_key` ON `Location`(`storeId`, `name`);
CREATE UNIQUE INDEX `Vendor_storeId_name_key` ON `Vendor`(`storeId`, `name`);
CREATE UNIQUE INDEX `Brand_storeId_name_key` ON `Brand`(`storeId`, `name`);
CREATE UNIQUE INDEX `Product_storeId_sku_key` ON `Product`(`storeId`, `sku`);
CREATE UNIQUE INDEX `ProductUnit_storeId_serial_key` ON `ProductUnit`(`storeId`, `serial`);
CREATE UNIQUE INDEX `Ticket_storeId_number_key` ON `Ticket`(`storeId`, `number`);
CREATE UNIQUE INDEX `Sale_storeId_number_key` ON `Sale`(`storeId`, `number`);
CREATE UNIQUE INDEX `Layaway_storeId_number_key` ON `Layaway`(`storeId`, `number`);
CREATE UNIQUE INDEX `Invoice_storeId_number_key` ON `Invoice`(`storeId`, `number`);

-- ------------------------------------------------------------- indexes/FKs ---

CREATE INDEX `User_storeId_idx` ON `User`(`storeId`);
CREATE INDEX `Location_storeId_idx` ON `Location`(`storeId`);
CREATE INDEX `Category_storeId_idx` ON `Category`(`storeId`);
CREATE INDEX `Vendor_storeId_idx` ON `Vendor`(`storeId`);
CREATE INDEX `Brand_storeId_idx` ON `Brand`(`storeId`);
CREATE INDEX `Product_storeId_idx` ON `Product`(`storeId`);
CREATE INDEX `ProductUnit_storeId_idx` ON `ProductUnit`(`storeId`);
CREATE INDEX `Customer_storeId_idx` ON `Customer`(`storeId`);
CREATE INDEX `Ticket_storeId_idx` ON `Ticket`(`storeId`);
CREATE INDEX `Sale_storeId_idx` ON `Sale`(`storeId`);
CREATE INDEX `Layaway_storeId_idx` ON `Layaway`(`storeId`);
CREATE INDEX `Invoice_storeId_idx` ON `Invoice`(`storeId`);

ALTER TABLE `User` ADD CONSTRAINT `User_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Location` ADD CONSTRAINT `Location_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Category` ADD CONSTRAINT `Category_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Brand` ADD CONSTRAINT `Brand_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Product` ADD CONSTRAINT `Product_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Layaway` ADD CONSTRAINT `Layaway_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
