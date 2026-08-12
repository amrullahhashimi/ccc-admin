-- One logo isn't enough: the app shows a full logo on light and dark
-- backgrounds, a square mark when the sidebar is collapsed, and a wider one on
-- the sign-in screen. The existing upload is kept as the light full logo.

ALTER TABLE `Store` CHANGE COLUMN `logo` `logoLight` LONGTEXT NULL;

ALTER TABLE `Store`
  ADD COLUMN `logoDark`  LONGTEXT NULL,
  ADD COLUMN `iconLight` LONGTEXT NULL,
  ADD COLUMN `iconDark`  LONGTEXT NULL,
  ADD COLUMN `authLogo`  LONGTEXT NULL;
