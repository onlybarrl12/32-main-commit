-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LOCATION_USER', 'STATION_INCHARGE', 'BASE_INCHARGE', 'TS_DEPT', 'FINANCE_DEPT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('LOCATION', 'BASE', 'REGION', 'ALL');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'PENDING_STATION', 'PENDING_BASE', 'PENDING_TS', 'PENDING_FINANCE', 'APPROVED');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('EXISTING_WORK_ORDER', 'APPROVED_PR', 'AUDIT_RECOMMENDATION', 'PMC_ATR_POINT', 'NEW');

-- CreateEnum
CREATE TYPE "RecurringType" AS ENUM ('RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('APPROVE', 'RETURN');

-- CreateEnum
CREATE TYPE "ActualsDataType" AS ENUM ('ACTUAL_EXPENDITURE', 'APPROVED_BE', 'ONGOING_EXPENDITURE');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "regionId" TEXT NOT NULL,

    CONSTRAINT "company_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "companyCodeId" TEXT NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bases" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centres" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyCodeId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,

    CONSTRAINT "cost_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_heads" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "budget_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetHeadId" TEXT NOT NULL,

    CONSTRAINT "budget_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "companyCodeId" TEXT,
    "personnelArea" TEXT,
    "personnelSubArea" TEXT,
    "employeeGroup" TEXT,
    "employeeSubgroup" TEXT,
    "designationLong" TEXT,
    "designationShort" TEXT,
    "employeeCategory" TEXT,
    "empContrlOff" TEXT,
    "function" TEXT,
    "functionalArea" TEXT,
    "baseId" TEXT,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_cycles" (
    "id" TEXT NOT NULL,
    "financialYearRBE" TEXT NOT NULL,
    "financialYearBE" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_headers" (
    "id" TEXT NOT NULL,
    "costCentreId" TEXT NOT NULL,
    "budgetHeadId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_headers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_entries" (
    "id" TEXT NOT NULL,
    "headerId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "rbeMaterial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rbeService" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "beMaterial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "beService" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "workType" "WorkType" NOT NULL,
    "recurringOneTime" "RecurringType" NOT NULL,
    "referenceTakenFrom" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_attachments" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" TEXT NOT NULL,
    "headerId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "actionByUserId" TEXT NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "remarks" TEXT,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actuals_import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER,

    CONSTRAINT "actuals_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actuals_rows" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "glAccount" TEXT,
    "commitmentItem" TEXT,
    "commitmentItemName" TEXT,
    "costCentreCode" TEXT NOT NULL,
    "fundsCenterName" TEXT,
    "lineItemCode" TEXT NOT NULL,
    "lineItemName" TEXT,
    "valTypeText" TEXT,
    "amountType" TEXT,
    "fiscalYear" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "dataType" "ActualsDataType" NOT NULL,

    CONSTRAINT "actuals_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedByUserId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diff" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_codes_code_key" ON "company_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_code_key" ON "pipelines"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bases_code_key" ON "bases"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bases_name_key" ON "bases"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centres_code_key" ON "cost_centres"("code");

-- CreateIndex
CREATE INDEX "cost_centres_baseId_idx" ON "cost_centres"("baseId");

-- CreateIndex
CREATE INDEX "cost_centres_pipelineId_idx" ON "cost_centres"("pipelineId");

-- CreateIndex
CREATE INDEX "cost_centres_companyCodeId_idx" ON "cost_centres"("companyCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_heads_code_key" ON "budget_heads"("code");

-- CreateIndex
CREATE UNIQUE INDEX "budget_heads_name_key" ON "budget_heads"("name");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_items_code_key" ON "budget_line_items"("code");

-- CreateIndex
CREATE INDEX "budget_line_items_budgetHeadId_idx" ON "budget_line_items"("budgetHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeNo_key" ON "employees"("employeeNo");

-- CreateIndex
CREATE INDEX "employees_baseId_idx" ON "employees"("baseId");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "user_access_userId_idx" ON "user_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_cycles_financialYearRBE_financialYearBE_key" ON "budget_cycles"("financialYearRBE", "financialYearBE");

-- CreateIndex
CREATE INDEX "budget_headers_status_idx" ON "budget_headers"("status");

-- CreateIndex
CREATE INDEX "budget_headers_cycleId_idx" ON "budget_headers"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_headers_costCentreId_budgetHeadId_cycleId_key" ON "budget_headers"("costCentreId", "budgetHeadId", "cycleId");

-- CreateIndex
CREATE INDEX "budget_entries_headerId_idx" ON "budget_entries"("headerId");

-- CreateIndex
CREATE INDEX "budget_entries_lineItemId_idx" ON "budget_entries"("lineItemId");

-- CreateIndex
CREATE INDEX "budget_attachments_entryId_idx" ON "budget_attachments"("entryId");

-- CreateIndex
CREATE INDEX "approval_actions_headerId_idx" ON "approval_actions"("headerId");

-- CreateIndex
CREATE INDEX "actuals_rows_batchId_idx" ON "actuals_rows"("batchId");

-- CreateIndex
CREATE INDEX "actuals_rows_costCentreCode_idx" ON "actuals_rows"("costCentreCode");

-- CreateIndex
CREATE INDEX "actuals_rows_lineItemCode_idx" ON "actuals_rows"("lineItemCode");

-- CreateIndex
CREATE INDEX "actuals_rows_fiscalYear_period_idx" ON "actuals_rows"("fiscalYear", "period");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "company_codes" ADD CONSTRAINT "company_codes_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_companyCodeId_fkey" FOREIGN KEY ("companyCodeId") REFERENCES "company_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_companyCodeId_fkey" FOREIGN KEY ("companyCodeId") REFERENCES "company_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_budgetHeadId_fkey" FOREIGN KEY ("budgetHeadId") REFERENCES "budget_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyCodeId_fkey" FOREIGN KEY ("companyCodeId") REFERENCES "company_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_headers" ADD CONSTRAINT "budget_headers_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "cost_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_headers" ADD CONSTRAINT "budget_headers_budgetHeadId_fkey" FOREIGN KEY ("budgetHeadId") REFERENCES "budget_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_headers" ADD CONSTRAINT "budget_headers_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "budget_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_headers" ADD CONSTRAINT "budget_headers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_headerId_fkey" FOREIGN KEY ("headerId") REFERENCES "budget_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "budget_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "budget_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_attachments" ADD CONSTRAINT "budget_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_headerId_fkey" FOREIGN KEY ("headerId") REFERENCES "budget_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_actionByUserId_fkey" FOREIGN KEY ("actionByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals_import_batches" ADD CONSTRAINT "actuals_import_batches_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals_rows" ADD CONSTRAINT "actuals_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "actuals_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
