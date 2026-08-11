-- AlterTable
ALTER TABLE `Sale` ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'APP',
    ADD COLUMN `cloverOrderId` VARCHAR(191) NULL,
    ADD COLUMN `needsReview` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `Sale_cloverOrderId_key` ON `Sale`(`cloverOrderId`);
