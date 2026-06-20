-- CreateTable
CREATE TABLE "RentalTemplateFieldMap" (
    "id" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "templateEnvelopeId" TEXT NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "termKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalTemplateFieldMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalTemplateFieldMap_templateEnvelopeId_fieldId_key" ON "RentalTemplateFieldMap"("templateEnvelopeId", "fieldId");

-- CreateIndex
CREATE INDEX "RentalTemplateFieldMap_templateEnvelopeId_idx" ON "RentalTemplateFieldMap"("templateEnvelopeId");

-- CreateIndex
CREATE INDEX "RentalTemplateFieldMap_teamId_idx" ON "RentalTemplateFieldMap"("teamId");
