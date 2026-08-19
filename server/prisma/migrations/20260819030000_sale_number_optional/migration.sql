-- A sale rung up on the Clover register is identified by its Clover order id,
-- which it already carries in cloverOrderId. Minting a shop sale number for it
-- as well gave it two identities and advanced the shop's own numbering for a
-- sale nobody rang up here, so that number is now left unset.
--
-- The @@unique([storeId, number]) index still holds: MySQL permits repeated
-- NULLs in a unique index, so any number of Clover sales can sit alongside the
-- shop's own numbered ones.

ALTER TABLE `Sale` MODIFY COLUMN `number` INTEGER NULL;
