-- Vendor product & price comparison.
--
-- Separate from Product/ProductUnit on purpose: those are things the shop owns
-- and can sell, these are things a vendor is offering. A price list has
-- hundreds of lines the shop will never buy, and giving each one a SKU and a
-- stock record would poison the inventory it shares a table with.

CREATE TABLE `CatalogProduct` (
  `id`             VARCHAR(191) NOT NULL,
  `brand`          VARCHAR(191) NULL,
  `model`          VARCHAR(191) NULL,
  `generation`     VARCHAR(191) NULL,
  `productType`    VARCHAR(191) NULL,
  `normalizedName` VARCHAR(191) NOT NULL,
  `matchKey`       VARCHAR(191) NOT NULL,
  `storage`        VARCHAR(191) NULL,
  `ram`            VARCHAR(191) NULL,
  `connectivity`   VARCHAR(191) NULL,
  `carrier`        VARCHAR(191) NULL,
  `condition`      VARCHAR(191) NULL,
  `grade`          VARCHAR(191) NULL,
  `color`          VARCHAR(191) NULL,
  `cpu`            VARCHAR(191) NULL,
  `screenSize`     VARCHAR(191) NULL,
  `specifications` JSON NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `storeId`        VARCHAR(191) NOT NULL,

  -- Same signature = same product. This is what stops two vendors' spellings
  -- from becoming two products, and what stops 32GB WiFi from swallowing
  -- 32GB WiFi+Cellular.
  UNIQUE INDEX `CatalogProduct_storeId_matchKey_key`(`storeId`, `matchKey`),
  INDEX `CatalogProduct_storeId_brand_idx`(`storeId`, `brand`),
  INDEX `CatalogProduct_storeId_normalizedName_idx`(`storeId`, `normalizedName`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VendorMessage` (
  `id`           VARCHAR(191) NOT NULL,
  `rawMessage`   LONGTEXT NOT NULL,
  `status`       VARCHAR(191) NOT NULL DEFAULT 'IMPORTED',
  `itemCount`    INTEGER NOT NULL DEFAULT 0,
  `receivedAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `vendorId`     VARCHAR(191) NOT NULL,
  `importedById` VARCHAR(191) NULL,
  `storeId`      VARCHAR(191) NOT NULL,

  INDEX `VendorMessage_storeId_receivedAt_idx`(`storeId`, `receivedAt`),
  INDEX `VendorMessage_vendorId_idx`(`vendorId`),
  INDEX `VendorMessage_importedById_idx`(`importedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VendorOffer` (
  `id`               VARCHAR(191) NOT NULL,
  `priceCents`       INTEGER NOT NULL,
  `currency`         VARCHAR(191) NOT NULL DEFAULT 'CAD',
  `minQuantity`      INTEGER NOT NULL DEFAULT 1,
  `maxQuantity`      INTEGER NULL,
  `condition`        VARCHAR(191) NULL,
  `grade`            VARCHAR(191) NULL,
  `note`             TEXT NULL,
  `active`           BOOLEAN NOT NULL DEFAULT true,
  `lastSeenAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `vendorId`         VARCHAR(191) NOT NULL,
  `catalogProductId` VARCHAR(191) NOT NULL,
  `sourceMessageId`  VARCHAR(191) NULL,
  `storeId`          VARCHAR(191) NOT NULL,

  -- A quantity tier is identified by where it starts, so the same vendor
  -- re-sending "10 or more" updates that tier rather than adding a second one.
  UNIQUE INDEX `VendorOffer_vendorId_catalogProductId_minQuantity_key`(`vendorId`, `catalogProductId`, `minQuantity`),
  INDEX `VendorOffer_storeId_catalogProductId_idx`(`storeId`, `catalogProductId`),
  INDEX `VendorOffer_storeId_vendorId_idx`(`storeId`, `vendorId`),
  INDEX `VendorOffer_sourceMessageId_idx`(`sourceMessageId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OfferPriceHistory` (
  `id`            VARCHAR(191) NOT NULL,
  `oldPriceCents` INTEGER NOT NULL,
  `newPriceCents` INTEGER NOT NULL,
  `changedAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `vendorOfferId` VARCHAR(191) NOT NULL,
  `changedById`   VARCHAR(191) NULL,
  `storeId`       VARCHAR(191) NOT NULL,

  INDEX `OfferPriceHistory_storeId_changedAt_idx`(`storeId`, `changedAt`),
  INDEX `OfferPriceHistory_vendorOfferId_idx`(`vendorOfferId`),
  INDEX `OfferPriceHistory_changedById_idx`(`changedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CatalogProduct`
  ADD CONSTRAINT `CatalogProduct_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VendorMessage`
  ADD CONSTRAINT `VendorMessage_vendorId_fkey`
  FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VendorMessage`
  ADD CONSTRAINT `VendorMessage_importedById_fkey`
  FOREIGN KEY (`importedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VendorMessage`
  ADD CONSTRAINT `VendorMessage_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VendorOffer`
  ADD CONSTRAINT `VendorOffer_vendorId_fkey`
  FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VendorOffer`
  ADD CONSTRAINT `VendorOffer_catalogProductId_fkey`
  FOREIGN KEY (`catalogProductId`) REFERENCES `CatalogProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VendorOffer`
  ADD CONSTRAINT `VendorOffer_sourceMessageId_fkey`
  FOREIGN KEY (`sourceMessageId`) REFERENCES `VendorMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VendorOffer`
  ADD CONSTRAINT `VendorOffer_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OfferPriceHistory`
  ADD CONSTRAINT `OfferPriceHistory_vendorOfferId_fkey`
  FOREIGN KEY (`vendorOfferId`) REFERENCES `VendorOffer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OfferPriceHistory`
  ADD CONSTRAINT `OfferPriceHistory_changedById_fkey`
  FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `OfferPriceHistory`
  ADD CONSTRAINT `OfferPriceHistory_storeId_fkey`
  FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
