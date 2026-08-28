-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordEncrypted" TEXT;

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_requests_userId_idx" ON "password_reset_requests"("userId");

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

