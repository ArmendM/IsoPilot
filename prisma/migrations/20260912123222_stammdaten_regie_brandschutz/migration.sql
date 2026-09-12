-- CreateEnum
CREATE TYPE "RegieTariff" AS ENUM ('A', 'B');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "iban" TEXT,
ADD COLUMN     "regieRateA" DECIMAL(10,2),
ADD COLUMN     "regieRateB" DECIMAL(10,2),
ADD COLUMN     "regieValidFrom" DATE;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "fireClass" TEXT,
ADD COLUMN     "smallQtySurcharge" DECIMAL(10,2),
ADD COLUMN     "smallQtyThreshold" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "regieTariff" "RegieTariff" NOT NULL DEFAULT 'A';
