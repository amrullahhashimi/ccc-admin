-- AlterTable
ALTER TABLE `Vendor` ADD COLUMN `createdById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `createdById` VARCHAR(191) NULL;

-- Everything that already exists belongs to the owner account, so basic users
-- start with a clean slate rather than inheriting the shop's whole vendor list.
UPDATE `Vendor` SET `createdById` = (
  SELECT `id` FROM `User` WHERE `role` = 'OWNER' AND `active` = true ORDER BY `createdAt` ASC LIMIT 1
) WHERE `createdById` IS NULL;

UPDATE `Product` SET `createdById` = (
  SELECT `id` FROM `User` WHERE `role` = 'OWNER' AND `active` = true ORDER BY `createdAt` ASC LIMIT 1
) WHERE `createdById` IS NULL;

-- CreateIndex
CREATE INDEX `Vendor_createdById_idx` ON `Vendor`(`createdById`);

-- CreateIndex
CREATE INDEX `Product_createdById_idx` ON `Product`(`createdById`);

-- AddForeignKey
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
