-- Sales rung up on the Clover register are matched back to the serial they
-- consumed, so the serial row in Inventory can point at the sale it went out on.
--
-- cloverPolledAt is how far the order poller has read. Polling rather than
-- webhooks because a merchant API token is not a webhook subscriber — Clover
-- only calls back to an installed developer app.

ALTER TABLE `ProductUnit` ADD COLUMN `saleId` VARCHAR(191) NULL;

CREATE INDEX `ProductUnit_saleId_idx` ON `ProductUnit`(`saleId`);

ALTER TABLE `ProductUnit`
  ADD CONSTRAINT `ProductUnit_saleId_fkey`
  FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Store` ADD COLUMN `cloverPolledAt` DATETIME(3) NULL;
