-- CreateEnum
CREATE TYPE "MerchantLandingStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CheckInTokenStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MerchantCheckInStatus" AS ENUM ('CHECKED_IN', 'INVALID');

-- CreateTable
CREATE TABLE "MerchantLanding" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "status" "MerchantLandingStatus" NOT NULL DEFAULT 'ACTIVE',
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantLanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCheckInToken" (
    "id" TEXT NOT NULL,
    "landingId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "CheckInTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCheckInToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCheckInRecord" (
    "id" TEXT NOT NULL,
    "landingId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "status" "MerchantCheckInStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantCheckInRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantLanding_slug_key" ON "MerchantLanding"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantLanding_applicationId_key" ON "MerchantLanding"("applicationId");

-- CreateIndex
CREATE INDEX "MerchantLanding_merchantId_status_idx" ON "MerchantLanding"("merchantId", "status");

-- CreateIndex
CREATE INDEX "MerchantLanding_influencerId_status_idx" ON "MerchantLanding"("influencerId", "status");

-- CreateIndex
CREATE INDEX "MerchantLanding_missionId_status_idx" ON "MerchantLanding"("missionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCheckInToken_tokenHash_key" ON "MerchantCheckInToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MerchantCheckInToken_landingId_status_expiresAt_idx" ON "MerchantCheckInToken"("landingId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "MerchantCheckInToken_expiresAt_idx" ON "MerchantCheckInToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCheckInRecord_tokenId_key" ON "MerchantCheckInRecord"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCheckInRecord_applicationId_key" ON "MerchantCheckInRecord"("applicationId");

-- CreateIndex
CREATE INDEX "MerchantCheckInRecord_influencerId_checkedInAt_idx" ON "MerchantCheckInRecord"("influencerId", "checkedInAt");

-- CreateIndex
CREATE INDEX "MerchantCheckInRecord_merchantId_checkedInAt_idx" ON "MerchantCheckInRecord"("merchantId", "checkedInAt");

-- CreateIndex
CREATE INDEX "MerchantCheckInRecord_missionId_checkedInAt_idx" ON "MerchantCheckInRecord"("missionId", "checkedInAt");

-- AddForeignKey
ALTER TABLE "MerchantLanding" ADD CONSTRAINT "MerchantLanding_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLanding" ADD CONSTRAINT "MerchantLanding_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "MissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLanding" ADD CONSTRAINT "MerchantLanding_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantLanding" ADD CONSTRAINT "MerchantLanding_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "InfluencerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInToken" ADD CONSTRAINT "MerchantCheckInToken_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "MerchantLanding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInRecord" ADD CONSTRAINT "MerchantCheckInRecord_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "MerchantLanding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInRecord" ADD CONSTRAINT "MerchantCheckInRecord_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "MerchantCheckInToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInRecord" ADD CONSTRAINT "MerchantCheckInRecord_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInRecord" ADD CONSTRAINT "MerchantCheckInRecord_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "MissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInRecord" ADD CONSTRAINT "MerchantCheckInRecord_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCheckInRecord" ADD CONSTRAINT "MerchantCheckInRecord_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "InfluencerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
