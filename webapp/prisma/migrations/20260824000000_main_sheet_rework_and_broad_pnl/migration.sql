-- Hand-verified against actual DB state 2026-08-24 (see MAIN_SHEET_REWORK_PLAN.md).
-- "BroadPnlHead" enum type already exists (committed by an earlier partial
-- `migrate deploy` attempt before it failed) -- NOT recreated here.

-- AlterEnum
CREATE TYPE "ActualsDataType_new" AS ENUM ('LY_ACTUAL', 'APPROVED_BE', 'YTD_ACTUAL');
ALTER TABLE "actuals_rows" ALTER COLUMN "dataType" TYPE "ActualsDataType_new" USING ("dataType"::text::"ActualsDataType_new");
ALTER TYPE "ActualsDataType" RENAME TO "ActualsDataType_old";
ALTER TYPE "ActualsDataType_new" RENAME TO "ActualsDataType";
DROP TYPE "ActualsDataType_old";

-- DropForeignKey
ALTER TABLE "budget_entries" DROP CONSTRAINT "budget_entries_lineItemId_fkey";
ALTER TABLE "budget_headers" DROP CONSTRAINT "budget_headers_budgetHeadId_fkey";
ALTER TABLE "budget_line_items" DROP CONSTRAINT "budget_line_items_budgetHeadId_fkey";

-- DropIndex
DROP INDEX "actuals_rows_fiscalYear_period_idx";
DROP INDEX "actuals_rows_lineItemCode_idx";
DROP INDEX "budget_entries_lineItemId_idx";
DROP INDEX "budget_headers_costCentreId_budgetHeadId_cycleId_key";

-- AlterTable (table is empty -- truncated ahead of this migration, so NOT NULL is safe)
ALTER TABLE "actuals_import_batches" ADD COLUMN "dataType" "ActualsDataType" NOT NULL;

-- AlterTable
ALTER TABLE "actuals_rows"
  DROP COLUMN "amountType",
  DROP COLUMN "commitmentItem",
  DROP COLUMN "commitmentItemName",
  DROP COLUMN "fundsCenterName",
  DROP COLUMN "glAccount",
  DROP COLUMN "lineItemCode",
  DROP COLUMN "lineItemName",
  DROP COLUMN "period",
  DROP COLUMN "valTypeText",
  ADD COLUMN "costCentreName" TEXT,
  ADD COLUMN "subHeadCode" TEXT NOT NULL,
  ADD COLUMN "subHeadName" TEXT;

-- AlterTable
ALTER TABLE "budget_entries"
  DROP COLUMN "itemDescription",
  DROP COLUMN "lineItemId",
  ADD COLUMN "beQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "beRate" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "rbeQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "rbeRate" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "subHeadId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "budget_headers" DROP COLUMN "budgetHeadId";

-- AlterTable
ALTER TABLE "budget_heads" ADD COLUMN "broadPnlHead" "BroadPnlHead" NOT NULL;

-- DropTable
DROP TABLE "budget_line_items";

-- CreateTable
CREATE TABLE "budget_sub_heads" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetHeadId" TEXT NOT NULL,

    CONSTRAINT "budget_sub_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_head_uom" (
    "id" TEXT NOT NULL,
    "subHeadId" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_head_uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_head_rates" (
    "id" TEXT NOT NULL,
    "subHeadId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_head_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_sub_heads_code_key" ON "budget_sub_heads"("code");
CREATE INDEX "budget_sub_heads_budgetHeadId_idx" ON "budget_sub_heads"("budgetHeadId");
CREATE UNIQUE INDEX "sub_head_uom_subHeadId_key" ON "sub_head_uom"("subHeadId");
CREATE UNIQUE INDEX "sub_head_rates_subHeadId_fiscalYear_key" ON "sub_head_rates"("subHeadId", "fiscalYear");
CREATE INDEX "actuals_rows_subHeadCode_idx" ON "actuals_rows"("subHeadCode");
CREATE INDEX "actuals_rows_fiscalYear_idx" ON "actuals_rows"("fiscalYear");
CREATE INDEX "budget_entries_subHeadId_idx" ON "budget_entries"("subHeadId");
CREATE UNIQUE INDEX "budget_headers_costCentreId_cycleId_key" ON "budget_headers"("costCentreId", "cycleId");

-- AddForeignKey
ALTER TABLE "budget_sub_heads" ADD CONSTRAINT "budget_sub_heads_budgetHeadId_fkey" FOREIGN KEY ("budgetHeadId") REFERENCES "budget_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sub_head_uom" ADD CONSTRAINT "sub_head_uom_subHeadId_fkey" FOREIGN KEY ("subHeadId") REFERENCES "budget_sub_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sub_head_rates" ADD CONSTRAINT "sub_head_rates_subHeadId_fkey" FOREIGN KEY ("subHeadId") REFERENCES "budget_sub_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_subHeadId_fkey" FOREIGN KEY ("subHeadId") REFERENCES "budget_sub_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
