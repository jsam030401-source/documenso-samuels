-- AlterTable: deal-terms fields, prefilled into signing forms by field label.
ALTER TABLE "RentalApplication"
  ADD COLUMN "street" TEXT,
  ADD COLUMN "unitNumber" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "leaseTermMonths" INTEGER,
  ADD COLUMN "leaseStartDate" TIMESTAMP(3),
  ADD COLUMN "leaseEndDate" TIMESTAMP(3),
  ADD COLUMN "petsAllowed" BOOLEAN,
  ADD COLUMN "lastMonthRent" DECIMAL(65,30),
  ADD COLUMN "securityDeposit" DECIMAL(65,30),
  ADD COLUMN "brokerFee" DECIMAL(65,30),
  ADD COLUMN "lockChangeFee" DECIMAL(65,30),
  ADD COLUMN "applicationFee" DECIMAL(65,30),
  ADD COLUMN "todaysDeposit" DECIMAL(65,30),
  ADD COLUMN "balanceDue" DECIMAL(65,30);

-- Migrate the old single address line into the new street field.
UPDATE "RentalApplication" SET "street" = "unitAddress" WHERE "street" IS NULL AND "unitAddress" IS NOT NULL;
