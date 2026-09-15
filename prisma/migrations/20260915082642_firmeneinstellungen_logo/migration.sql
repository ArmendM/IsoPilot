/*
  Warnings:

  - You are about to drop the column `logoPath` on the `Company` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Company" DROP COLUMN "logoPath",
ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoName" TEXT,
ADD COLUMN     "logoTyp" TEXT;
