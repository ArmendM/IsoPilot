-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "weeklyHours" DECIMAL(5,2) NOT NULL DEFAULT 42;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balanceFrom" DATE,
ADD COLUMN     "startBalance" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "Workload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weeklyHours" DECIMAL(5,2) NOT NULL,
    "validFrom" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workload_userId_validFrom_idx" ON "Workload"("userId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Workload_userId_validFrom_key" ON "Workload"("userId", "validFrom");

-- AddForeignKey
ALTER TABLE "Workload" ADD CONSTRAINT "Workload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workload" ADD CONSTRAINT "Workload_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
