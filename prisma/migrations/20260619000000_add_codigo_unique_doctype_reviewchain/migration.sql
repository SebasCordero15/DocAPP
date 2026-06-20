-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PROCEDIMIENTO', 'MANUAL', 'INSTRUCTIVO', 'FORMATO', 'POLITICA', 'OTRO');

-- CreateEnum
CREATE TYPE "ReviewChainStatus" AS ENUM ('IN_REVIEW', 'COMPLETED', 'REJECTED', 'RETURNED_TO_CREATOR');

-- AlterTable
ALTER TABLE "DocumentTask" ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "reviewChainId" TEXT,
ADD COLUMN     "stepOrder" INTEGER;

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "departamento" TEXT,
ADD COLUMN     "tipoDocumento" "DocumentType";

-- CreateTable
CREATE TABLE "ReviewChain" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "ReviewChainStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "totalSteps" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewChain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewChain_fileId_key" ON "ReviewChain"("fileId");

-- CreateIndex
CREATE INDEX "ReviewChain_companyId_idx" ON "ReviewChain"("companyId");

-- CreateIndex
CREATE INDEX "ReviewChain_status_idx" ON "ReviewChain"("status");

-- CreateIndex
CREATE INDEX "DocumentTask_reviewChainId_idx" ON "DocumentTask"("reviewChainId");

-- CreateIndex
CREATE UNIQUE INDEX "File_companyId_codigo_key" ON "File"("companyId", "codigo");

-- AddForeignKey
ALTER TABLE "DocumentTask" ADD CONSTRAINT "DocumentTask_reviewChainId_fkey" FOREIGN KEY ("reviewChainId") REFERENCES "ReviewChain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewChain" ADD CONSTRAINT "ReviewChain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewChain" ADD CONSTRAINT "ReviewChain_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewChain" ADD CONSTRAINT "ReviewChain_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
