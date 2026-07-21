/*
  Warnings:

  - You are about to drop the column `batteryHealth` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `carrier` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `color` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `condition` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `imei` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `locationId` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `priceCents` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `serial` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `storage` on the `product` table. All the data in the column will be lost.
  - You are about to drop the column `trackSerial` on the `product` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `product` DROP FOREIGN KEY `Product_locationId_fkey`;

-- DropIndex
DROP INDEX `Product_imei_idx` ON `product`;

-- DropIndex
DROP INDEX `Product_locationId_fkey` ON `product`;

-- AlterTable
ALTER TABLE `product` DROP COLUMN `batteryHealth`,
    DROP COLUMN `carrier`,
    DROP COLUMN `color`,
    DROP COLUMN `condition`,
    DROP COLUMN `imei`,
    DROP COLUMN `locationId`,
    DROP COLUMN `model`,
    DROP COLUMN `priceCents`,
    DROP COLUMN `quantity`,
    DROP COLUMN `serial`,
    DROP COLUMN `storage`,
    DROP COLUMN `trackSerial`,
    ADD COLUMN `customSku` VARCHAR(191) NULL,
    ADD COLUMN `ean` VARCHAR(191) NULL,
    ADD COLUMN `onlinePriceCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `salePriceCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `upc` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProductUnit` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `serial` VARCHAR(191) NOT NULL,
    `condition` VARCHAR(191) NOT NULL,
    `storage` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'IN_STOCK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProductUnit_serial_key`(`serial`),
    INDEX `ProductUnit_productId_idx`(`productId`),
    INDEX `ProductUnit_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Product_upc_idx` ON `Product`(`upc`);

-- AddForeignKey
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductUnit` ADD CONSTRAINT `ProductUnit_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
