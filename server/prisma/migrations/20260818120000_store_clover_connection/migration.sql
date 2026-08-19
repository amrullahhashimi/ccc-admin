-- Clover credentials move out of the server's .env and onto the store row, so
-- each shop connects its own merchant account from Store settings instead of
-- one hard-coded account serving the whole deployment.
--
-- cloverApiToken is a secret: the API masks it on read and it is never sent to
-- the browser. cloverMerchantId is unique so an inbound webhook can find the
-- store that owns the order it is reporting.

ALTER TABLE `Store`
  ADD COLUMN `cloverEnv` VARCHAR(191) NOT NULL DEFAULT 'production',
  ADD COLUMN `cloverMerchantId` VARCHAR(191) NULL,
  ADD COLUMN `cloverApiToken` TEXT NULL,
  ADD COLUMN `cloverDeviceId` VARCHAR(191) NULL,
  ADD COLUMN `cloverRaid` VARCHAR(191) NULL,
  ADD COLUMN `cloverVerifiedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Store_cloverMerchantId_key` ON `Store`(`cloverMerchantId`);
