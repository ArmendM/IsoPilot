-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('PAUSCHAL', 'REGIE');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "billingMode" "BillingMode" NOT NULL DEFAULT 'PAUSCHAL';
