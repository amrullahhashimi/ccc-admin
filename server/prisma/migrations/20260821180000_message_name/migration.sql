-- A name for an import.
--
-- The comparison is built by picking imports out of a search box, and "the one
-- from Tuesday" is not something you can type. Null falls back to the vendor
-- and the date it arrived.

ALTER TABLE `VendorMessage` ADD COLUMN `name` VARCHAR(191) NULL;
