-- How many the vendor says they hold.
--
-- Wholesale lists carry a live stock column, and without somewhere to put it
-- the number was being read as part of the product name ("iPad 5 Good 4").
-- It is emphatically not minQuantity: a stock of 4 means they have four, not
-- that you must buy four. Null means the vendor didn't say.

ALTER TABLE `VendorOffer` ADD COLUMN `availableQuantity` INTEGER NULL;
