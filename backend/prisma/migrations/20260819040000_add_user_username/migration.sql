-- Team accounts (Cashier/Accountant/...) created by a merchant via
-- IamService.createUser rarely have a real email/mobile; a username lets
-- the merchant set one up with just a name, username, and password.
ALTER TABLE "users" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
