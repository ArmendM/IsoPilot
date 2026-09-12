-- CreateTable
CREATE TABLE "VacationBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled" DECIMAL(5,2) NOT NULL,
    "carriedOver" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carryOverExpiresAt" DATE,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacationBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacationBalance_year_idx" ON "VacationBalance"("year");

-- CreateIndex
CREATE UNIQUE INDEX "VacationBalance_userId_year_key" ON "VacationBalance"("userId", "year");

-- AddForeignKey
ALTER TABLE "VacationBalance" ADD CONSTRAINT "VacationBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
