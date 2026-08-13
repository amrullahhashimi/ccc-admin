-- Used stock rarely sells for one flat price: two of the same phone can differ
-- by condition, storage or what was paid for it. Each serial can now carry its
-- own sale price. NULL keeps the old behaviour — fall back to the product's.

ALTER TABLE `ProductUnit` ADD COLUMN `salePriceCents` INTEGER NULL;
