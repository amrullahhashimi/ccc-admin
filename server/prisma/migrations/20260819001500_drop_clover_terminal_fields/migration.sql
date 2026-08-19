-- Connecting a Clover account and driving a payment terminal turned out to be
-- two separate concerns. Connect to Clover covers reading and writing the
-- merchant's data; the terminal is configured only in the server's .env, so
-- these two columns never had a use.

ALTER TABLE `Store`
  DROP COLUMN `cloverDeviceId`,
  DROP COLUMN `cloverRaid`;
