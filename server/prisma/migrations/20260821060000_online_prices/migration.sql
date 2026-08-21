-- What a product sells for online, cached against the catalogue product.
--
-- These rows come from other people's websites. Caching them is both a courtesy
-- to those sites and the only way the product page can stay quick: a lookup
-- runs at most once every few hours per product, and every view after that
-- reads what is already here.

ALTER TABLE `CatalogProduct` ADD COLUMN `onlineCheckedAt` DATETIME(3) NULL;

CREATE TABLE `OnlinePrice` (
  `id`               VARCHAR(191) NOT NULL,
  `source`           VARCHAR(191) NOT NULL,
  `sourceLabel`      VARCHAR(191) NOT NULL,
  `tier`             VARCHAR(191) NOT NULL,
  `title`            TEXT NOT NULL,
  `url`              TEXT NOT NULL,
  `priceCents`       INTEGER NOT NULL,
  `currency`         VARCHAR(191) NOT NULL DEFAULT 'CAD',
  `location`         VARCHAR(191) NULL,
  `inStock`          BOOLEAN NULL,
  `checkedAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `catalogProductId` VARCHAR(191) NOT NULL,
  `storeId`          VARCHAR(191) NOT NULL,

  INDEX `OnlinePrice_storeId_catalogProductId_idx`(`storeId`, `catalogProductId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OnlinePrice`
  ADD CONSTRAINT `OnlinePrice_catalogProductId_fkey`
  FOREIGN KEY (`catalogProductId`) REFERENCES `CatalogProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OnlinePrice`
  ADD CONSTRAINT `OnlinePrice_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
