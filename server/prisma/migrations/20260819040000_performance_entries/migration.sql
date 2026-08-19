-- The shop's own end-of-day takings log, entered by hand.
--
-- Deliberately separate from Sale: this is what was counted at the counter, and
-- it is allowed to disagree with what the tills recorded. Folding the two
-- together would leave neither able to check the other.

CREATE TABLE `PerformanceEntry` (
  `id`          VARCHAR(191) NOT NULL,
  `date`        DATE NOT NULL,
  `saleType`    VARCHAR(191) NOT NULL,
  `paymentType` VARCHAR(191) NOT NULL,
  `amountCents` INTEGER NOT NULL,
  `note`        TEXT NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `userId`      VARCHAR(191) NULL,
  `storeId`     VARCHAR(191) NOT NULL,

  INDEX `PerformanceEntry_storeId_date_idx`(`storeId`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PerformanceEntry`
  ADD CONSTRAINT `PerformanceEntry_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PerformanceEntry`
  ADD CONSTRAINT `PerformanceEntry_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
