-- Postgres unique indexes treat NULL as distinct from NULL, so the existing
-- @@unique([companyId, name]) does NOT stop two system roles (company_id
-- IS NULL) from sharing a name. A partial unique index closes that gap
-- specifically for the company_id IS NULL subset (system roles: Owner,
-- Manager, Cashier, Accountant, Inventory Manager, ...).
CREATE UNIQUE INDEX "roles_system_name_key" ON "roles"("name") WHERE "company_id" IS NULL;
