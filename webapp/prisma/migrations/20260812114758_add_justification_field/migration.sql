/*
  Warnings:

  - Added the required column `justification` to the `budget_entries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "budget_entries" ADD COLUMN     "justification" TEXT NOT NULL;
