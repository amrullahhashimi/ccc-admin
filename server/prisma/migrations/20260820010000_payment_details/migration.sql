-- Clover tells us how a sale was actually paid — cash, credit, debit, cheque —
-- and for a card, which card. The importer was recording every register sale as
-- "CARD" regardless, so a drawer full of cash read back as card takings.
--
-- `details` carries the human description ("Interac ····9303, contactless").
-- Existing rows keep whatever method they were given; nothing is rewritten here,
-- because a migration is the wrong place to reinterpret somebody's records.

ALTER TABLE `Payment` ADD COLUMN `details` VARCHAR(191) NULL;
