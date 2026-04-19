import { PrismaClient, Role, VerificationStatus, MissionStatus, MissionApplicationStatus, MissionSubmissionStatus, PricingMode, WithdrawalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const seededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
};

const rng = seededRandom(20260225);
const baseTime = new Date('2026-01-01T00:00:00Z').getTime();

const pick = <T>(items: T[]) => items[Math.floor(rng() * items.length)];
const int = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

const categories = [
  '\u5f00\u7bb1',
  '\u63a2\u5e97',
  '\u5e26\u4eba',
  '\u771f\u5b9e\u8bc4\u4ef7',
  'Lifestyle',
  'Food',
  'Beauty',
  'Travel',
  'Fitness',
  'Tech',
  'Parenting',
  'Education'
];
const platformPool = ['IG', 'TikTok', 'FB'];

const createPasswordHash = (password: string) => bcrypt.hash(password, 10);

async function clearDb() {
  await prisma.commerceOrderItem.deleteMany();
  await prisma.commerceOrder.deleteMany();
  await prisma.commerceAddress.deleteMany();
  await prisma.merchantVoucher.deleteMany();
  await prisma.merchantProduct.deleteMany();
  await prisma.merchantCheckInRecord.deleteMany();
  await prisma.merchantCheckInToken.deleteMany();
  await prisma.merchantLanding.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.review.deleteMany();
  await prisma.missionSubmission.deleteMany();
  await prisma.missionApplication.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.pointsLedger.deleteMany();
  await prisma.pointsAccount.deleteMany();
  await prisma.merchantWalletLedger.deleteMany();
  await prisma.merchantWalletAccount.deleteMany();
  await prisma.revenueTopupIntent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.phoneOtp.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.category.deleteMany();
  await prisma.influencerProfile.deleteMany();
  await prisma.merchantProfile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await clearDb();

  const passwordHash = await createPasswordHash('Password123!');

  const admin = await prisma.user.create({
    data: {
      role: Role.ADMIN,
      email: 'admin@kolhub.my',
      passwordHash
    }
  });

  await prisma.setting.createMany({
    data: [
      { key: 'PLATFORM_FEE_PERCENT', value: '10' },
      { key: 'POINTS_TO_MYR_RATE', value: '0.02' },
      { key: 'MIN_WITHDRAWAL_MYR', value: '30' }
    ]
  });

  const categoryRows = await Promise.all(
    categories.map((name, index) =>
      prisma.category.create({
        data: {
          name,
          sortOrder: index,
          isEnabled: true
        }
      })
    )
  );

  const merchants: { userId: string; merchantProfileId: string; walletId: string; email: string; companyName: string }[] = [];

  for (let i = 1; i <= 6; i += 1) {
    const user = await prisma.user.create({
      data: {
        role: Role.MERCHANT,
        email: `merchant${i}@kolhub.my`,
        passwordHash
      }
    });

    const profile = await prisma.merchantProfile.create({
      data: {
        userId: user.id,
        companyName: `Merchant Company ${i}`,
        contactPerson: `Contact ${i}`,
        phone: `60112222${100 + i}`,
        email: user.email,
        address: `Jalan Demo ${i}, Kuala Lumpur`,
        socials: {
          instagram: `https://instagram.com/merchant${i}`,
          facebook: `https://facebook.com/merchant${i}`,
          tiktok: `https://tiktok.com/@merchant${i}`,
          whatsapp: `https://wa.me/6011000000${i}`,
          website: `https://merchant${i}.kolhub.my`,
          businessCategory: pick(categories),
          businessHours: 'Daily | 10:00 AM - 10:00 PM',
          shortDescription: `Merchant Company ${i} runs local creator campaigns with a focus on measurable store visits.`,
          coverImageUrl: `https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80`,
          heroHeadline: `Merchant Company ${i} brings creator traffic into the store.`,
          heroSubheadline: 'Use profile content as the source of truth for future merchant landing pages.',
          primaryCtaLabel: 'Contact us',
          primaryCtaUrl: `https://merchant${i}.kolhub.my/contact`,
          highlight1: 'Store visits',
          highlight2: 'Creator campaigns',
          highlight3: 'Repeat traffic',
          brandPrimaryColor: '#FF6138',
          brandAccentColor: '#111827'
        }
      }
    });

    const wallet = await prisma.merchantWalletAccount.create({
      data: {
        merchantId: profile.id,
        balance: 0
      }
    });

    let walletBalance = 0;
    for (let t = 0; t < 3; t += 1) {
      const amount = int(12000, 20000);
      walletBalance += amount;
      const reference = `RM-SEED-${i}-${t}`;
      await prisma.revenueTopupIntent.create({
        data: {
          referenceId: reference,
          merchantId: profile.id,
          amount,
          status: 'PAID',
          paymentUrl: `http://localhost:4000/dev/mock-pay/${reference}`,
          providerPayload: { source: 'seed' }
        }
      });
      await prisma.merchantWalletLedger.create({
        data: {
          walletAccountId: wallet.id,
          amount,
          direction: 'CREDIT',
          type: 'TOPUP',
          reference,
          notes: 'Seed topup'
        }
      });
    }

    await prisma.merchantWalletAccount.update({
      where: { id: wallet.id },
      data: { balance: walletBalance }
    });

    merchants.push({ userId: user.id, merchantProfileId: profile.id, walletId: wallet.id, email: user.email, companyName: profile.companyName });
  }

  const influencers: {
    userId: string;
    influencerId: string;
    pointsAccountId: string;
    verificationStatus: VerificationStatus;
    email: string;
  }[] = [];

  for (let i = 1; i <= 30; i += 1) {
    const user = await prisma.user.create({
      data: {
        role: Role.INFLUENCER,
        email: `influencer${i}@kolhub.my`,
        passwordHash
      }
    });

    const status: VerificationStatus = i <= 18 ? 'APPROVED' : i <= 24 ? 'PENDING' : 'REJECTED';

    const profile = await prisma.influencerProfile.create({
      data: {
        userId: user.id,
        igLink: `https://instagram.com/influencer${i}`,
        tiktokLink: i % 2 === 0 ? `https://tiktok.com/@influencer${i}` : null,
        followerCount: int(1000, 120000),
        verificationStatus: status,
        verificationNotes: status === 'REJECTED' ? 'Proof unclear' : null,
        proofImageUrl: `/uploads/influencer-proof-${i}.jpg`,
        phone: `60135555${100 + i}`,
        phoneVerifiedAt: status === 'APPROVED' ? new Date() : null
      }
    });

    const points = await prisma.pointsAccount.create({
      data: {
        influencerId: profile.id,
        balancePoints: 0
      }
    });

    await prisma.phoneOtp.create({
      data: {
        phone: profile.phone,
        code: '123456',
        isUsed: true,
        expiresAt: new Date(baseTime + 60_000)
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        commercePreferences: {
          orderUpdates: true,
          promoAlerts: i % 3 !== 0,
          rememberCheckoutAddress: true
        }
      }
    });

    influencers.push({
      userId: user.id,
      influencerId: profile.id,
      pointsAccountId: points.id,
      verificationStatus: status,
      email: user.email
    });
  }

  const merchantProducts: Array<{ id: string; merchantId: string; price: number }> = [];

  for (const [merchantIndex, merchant] of merchants.entries()) {
    const samples = [
      {
        name: `${merchant.companyName} Signature Set`,
        sku: `SIG-${merchantIndex + 1}-01`,
        category: 'Signature',
        price: 79,
        stock: 24,
        status: 'ACTIVE' as const,
        description: 'Best-performing store bundle for creator-friendly product discovery.',
        imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: `${merchant.companyName} Social Box`,
        sku: `BOX-${merchantIndex + 1}-02`,
        category: 'Bundle',
        price: 129,
        stock: 18,
        status: 'ACTIVE' as const,
        description: 'Mid-ticket bundle optimized for shared tables, gifting, and referral conversion.',
        imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: `${merchant.companyName} Reserve Drop`,
        sku: `RSV-${merchantIndex + 1}-03`,
        category: 'Limited',
        price: 168,
        stock: 10,
        status: merchantIndex % 2 === 0 ? ('DRAFT' as const) : ('ACTIVE' as const),
        description: 'Higher-value featured drop used for premium creator-led checkout flows.',
        imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=800&q=80'
      }
    ];

    for (const [productIndex, sample] of samples.entries()) {
      const product = await prisma.merchantProduct.create({
        data: {
          merchantId: merchant.merchantProfileId,
          name: sample.name,
          slug: `${sample.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${merchantIndex + 1}-${productIndex + 1}`,
          sku: sample.sku,
          category: sample.category,
          price: sample.price,
          stock: sample.stock,
          status: sample.status,
          description: sample.description,
          imageUrl: sample.imageUrl
        }
      });

      merchantProducts.push({
        id: product.id,
        merchantId: merchant.merchantProfileId,
        price: sample.price
      });
    }

    await prisma.merchantVoucher.createMany({
      data: [
        {
          merchantId: merchant.merchantProfileId,
          code: `VC-${merchantIndex + 1}-0001`,
          title: 'Campaign Gift Card',
          productName: `${merchant.companyName} Signature Set`,
          campaignName: 'Storefront Referral Launch',
          status: 'READY',
          referredBy: {
            id: `ref-${merchantIndex + 1}-1`,
            name: `Referrer ${merchantIndex + 1}`,
            email: `referrer${merchantIndex + 1}@kolhub.my`,
            phone: `60128888${100 + merchantIndex}`
          },
          redeemingUser: {
            id: `buyer-${merchantIndex + 1}-1`,
            name: `Buyer ${merchantIndex + 1}`,
            email: `buyer${merchantIndex + 1}@example.com`,
            phone: `60137777${100 + merchantIndex}`
          },
          validUntil: new Date('2026-12-31T23:59:59.000Z')
        },
        {
          merchantId: merchant.merchantProfileId,
          code: `VC-${merchantIndex + 1}-0002`,
          title: 'Campaign Gift Card',
          productName: `${merchant.companyName} Social Box`,
          campaignName: 'Storefront Referral Launch',
          status: 'USED',
          referredBy: {
            id: `ref-${merchantIndex + 1}-2`,
            name: `Referral User ${merchantIndex + 1}`,
            email: `referral${merchantIndex + 1}@kolhub.my`
          },
          redeemingUser: {
            id: `buyer-${merchantIndex + 1}-2`,
            name: `Redeemed Buyer ${merchantIndex + 1}`,
            email: `redeemed${merchantIndex + 1}@example.com`
          },
          validUntil: new Date('2026-12-31T23:59:59.000Z'),
          usedAt: new Date('2026-03-28T14:15:00.000Z')
        }
      ]
    });
  }

  const missions: { id: string; merchantProfileId: string; status: MissionStatus; quota: number; budget: number; title: string; walletId: string }[] = [];

  for (let i = 1; i <= 80; i += 1) {
    const merchant = pick(merchants);
    const category = pick(categoryRows);
    const pricingMode: PricingMode = rng() > 0.5 ? 'FIXED_BUDGET' : 'COMMISSION_POOL';
    const budget = int(300, 5000);
    const platformFee = Number((budget * 0.1).toFixed(2));
    const totalCharge = Number((budget + platformFee).toFixed(2));
    const quota = int(3, 10);

    let status: MissionStatus;
    const roll = rng();
    if (roll < 0.15) status = 'DRAFT';
    else if (roll < 0.45) status = 'PUBLISHED';
    else if (roll < 0.7) status = 'IN_PROGRESS';
    else if (roll < 0.85) status = 'COMPLETED';
    else if (roll < 0.93) status = 'CANCELLED';
    else status = 'SUSPENDED';

    const mission = await prisma.mission.create({
      data: {
        merchantProfileId: merchant.merchantProfileId,
        categoryId: category.id,
        title: `Mission #${i} ${category.name}`,
        description: `Campaign mission ${i} for ${category.name} creators with KPI deliverables.`,
        platformRequirements: [pick(platformPool), pick(platformPool)].filter((v, idx, arr) => arr.indexOf(v) === idx),
        deliverablesChecklist: ['Post 1 reel/video', 'Include hashtags', 'Submit analytics screenshot'],
        location: rng() > 0.55 ? 'Kuala Lumpur' : null,
        deadline: new Date(baseTime + int(-10, 45) * 24 * 3600 * 1000),
        quota,
        pricingMode,
        commissionPoolAmount: pricingMode === 'COMMISSION_POOL' ? budget : null,
        fixedBudgetAmount: pricingMode === 'FIXED_BUDGET' ? budget : null,
        platformFeeAmount: platformFee,
        totalChargeAmount: totalCharge,
        status,
        suspendedReason: status === 'SUSPENDED' ? 'Abusive content flagged' : null
      }
    });

    missions.push({ id: mission.id, merchantProfileId: merchant.merchantProfileId, status, quota, budget, title: mission.title, walletId: merchant.walletId });

    if (['PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SUSPENDED'].includes(status)) {
      await prisma.merchantWalletAccount.update({
        where: { id: merchant.walletId },
        data: {
          balance: { decrement: totalCharge }
        }
      });
      await prisma.merchantWalletLedger.create({
        data: {
          walletAccountId: merchant.walletId,
          amount: totalCharge,
          direction: 'DEBIT',
          type: 'CHARGE',
          reference: `MISSION-${mission.id}`,
          notes: 'Seed mission charge'
        }
      });
    }
  }

  const approvedInfluencers = influencers.filter((i) => i.verificationStatus === 'APPROVED');

  for (const mission of missions) {
    if (!['PUBLISHED', 'IN_PROGRESS', 'COMPLETED'].includes(mission.status)) continue;

    const applicantsCount = int(2, Math.min(12, approvedInfluencers.length));
    const chosen = new Set<string>();

    for (let a = 0; a < applicantsCount; a += 1) {
      let influencer = pick(approvedInfluencers);
      let guard = 0;
      while (chosen.has(influencer.influencerId) && guard < 20) {
        influencer = pick(approvedInfluencers);
        guard += 1;
      }
      chosen.add(influencer.influencerId);

      let appStatus: MissionApplicationStatus = 'APPLIED';
      if (mission.status === 'COMPLETED' || mission.status === 'IN_PROGRESS') appStatus = rng() > 0.35 ? 'ACCEPTED' : 'REJECTED';
      else if (mission.status === 'PUBLISHED') appStatus = rng() > 0.75 ? 'ACCEPTED' : 'APPLIED';

      const app = await prisma.missionApplication.create({
        data: {
          missionId: mission.id,
          influencerId: influencer.influencerId,
          status: appStatus
        }
      });

      if (appStatus === 'ACCEPTED') {
        await prisma.chat.create({
          data: {
            missionId: mission.id,
            applicationId: app.id,
            merchantId: mission.merchantProfileId,
            influencerId: influencer.influencerId
          }
        });

        if (rng() > 0.4 || mission.status === 'COMPLETED') {
          let submissionStatus: MissionSubmissionStatus = 'SUBMITTED';
          if (mission.status === 'COMPLETED') submissionStatus = 'APPROVED';
          else {
            const subRoll = rng();
            if (subRoll > 0.7) submissionStatus = 'APPROVED';
            else if (subRoll > 0.4) submissionStatus = 'RESUBMIT_REQUIRED';
            else submissionStatus = 'REJECTED';
          }

          const submission = await prisma.missionSubmission.create({
            data: {
              missionId: mission.id,
              applicationId: app.id,
              influencerId: influencer.influencerId,
              proofImages: [`/uploads/proof-${mission.id}-${a}.jpg`],
              proofLinks: [`https://instagram.com/p/seed-${mission.id}-${a}`],
              caption: `Seed submission for ${mission.title}`,
              status: submissionStatus,
              reviewNote: submissionStatus === 'APPROVED' ? 'Great work' : 'Needs improvement'
            }
          });

          if (submissionStatus === 'APPROVED') {
            const payout = mission.budget / mission.quota;
            const points = Math.max(1, Math.round(payout / 0.02));
            await prisma.pointsAccount.update({
              where: { id: influencer.pointsAccountId },
              data: { balancePoints: { increment: points } }
            });
            await prisma.pointsLedger.create({
              data: {
                pointsAccountId: influencer.pointsAccountId,
                points,
                type: 'MISSION_EARNING',
                reference: `SUBMISSION-${submission.id}`,
                notes: 'Seed mission earning'
              }
            });

            if (rng() > 0.35) {
              await prisma.review.create({
                data: {
                  missionId: mission.id,
                  submissionId: submission.id,
                  merchantId: mission.merchantProfileId,
                  influencerId: influencer.influencerId,
                  star: int(3, 5),
                  comment: 'Good collaboration and timely delivery.'
                }
              });
            }
          }
        }
      }
    }
  }

  const acceptedApplications = await prisma.missionApplication.findMany({
    where: { status: 'ACCEPTED' },
    include: {
      mission: true
    },
    orderBy: { createdAt: 'desc' },
    take: 16
  });

  for (const [index, application] of acceptedApplications.entries()) {
    const landing = await prisma.merchantLanding.create({
      data: {
        slug: index === 0 ? 'merchant-landing-live' : `landing-${application.id.slice(0, 10)}-${index + 1}`,
        missionId: application.missionId,
        applicationId: application.id,
        merchantId: application.mission.merchantProfileId,
        influencerId: application.influencerId,
        status: 'ACTIVE',
        sharedAt: new Date(baseTime + (index + 2) * 3600 * 1000)
      }
    });

    if (index >= 6) continue;

    const checkedInAt = new Date(baseTime + (index + 3) * 7200 * 1000);
    const token = await prisma.merchantCheckInToken.create({
      data: {
        landingId: landing.id,
        tokenHash: crypto.createHash('sha256').update(`seed-checkin-${application.id}`).digest('hex'),
        status: 'USED',
        expiresAt: new Date(checkedInAt.getTime() + 5 * 60 * 1000),
        consumedAt: checkedInAt,
        consumedByIp: '127.0.0.1'
      }
    });

    await prisma.merchantCheckInRecord.create({
      data: {
        landingId: landing.id,
        tokenId: token.id,
        missionId: application.missionId,
        applicationId: application.id,
        merchantId: application.mission.merchantProfileId,
        influencerId: application.influencerId,
        status: 'CHECKED_IN',
        checkedInAt
      }
    });
  }

  for (const influencer of influencers) {
    const pointsAccount = await prisma.pointsAccount.findUniqueOrThrow({ where: { id: influencer.pointsAccountId } });
    if (pointsAccount.balancePoints < 500 || rng() > 0.45) continue;

    const pointsToWithdraw = int(300, Math.min(pointsAccount.balancePoints, 4000));
    const amountMYR = Number((pointsToWithdraw * 0.02).toFixed(2));
    if (amountMYR < 30) continue;

    const status: WithdrawalStatus = rng() > 0.7 ? 'PENDING' : rng() > 0.4 ? 'APPROVED' : rng() > 0.2 ? 'PAID' : 'REJECTED';

    await prisma.pointsAccount.update({
      where: { id: influencer.pointsAccountId },
      data: {
        balancePoints: {
          decrement: pointsToWithdraw
        }
      }
    });

    await prisma.pointsLedger.create({
      data: {
        pointsAccountId: influencer.pointsAccountId,
        points: -pointsToWithdraw,
        type: 'WITHDRAWAL_DEBIT',
        reference: `WDR-${influencer.influencerId.slice(0, 6)}-${pointsToWithdraw}`,
        notes: 'Seed withdrawal'
      }
    });

    if (status === 'REJECTED') {
      await prisma.pointsAccount.update({
        where: { id: influencer.pointsAccountId },
        data: {
          balancePoints: {
            increment: pointsToWithdraw
          }
        }
      });
      await prisma.pointsLedger.create({
        data: {
          pointsAccountId: influencer.pointsAccountId,
          points: pointsToWithdraw,
          type: 'ADJUSTMENT',
          reference: `WDR-REFUND-${influencer.influencerId.slice(0, 6)}`,
          notes: 'Seed withdrawal rejection refund'
        }
      });
    }

    await prisma.withdrawal.create({
      data: {
        influencerId: influencer.influencerId,
        pointsUsed: pointsToWithdraw,
        amountMYR,
        status,
        payoutRef: status === 'PAID' ? `BANK-REF-${influencer.influencerId.slice(0, 8)}` : null,
        adminNotes: status === 'REJECTED' ? 'Incorrect payout details' : null
      }
    });
  }

  const approvedInfluencerUsers = influencers.filter((item) => item.verificationStatus === 'APPROVED').slice(0, 8);
  const activeProducts = await prisma.merchantProduct.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' }
  });

  for (const [index, influencer] of approvedInfluencerUsers.entries()) {
    const address = await prisma.commerceAddress.create({
      data: {
        userId: influencer.userId,
        label: index % 2 === 0 ? 'Home' : 'Studio',
        recipientName: influencer.email.split('@')[0].replace(/\d+/g, '').trim() || `Influencer ${index + 1}`,
        phone: `60124444${100 + index}`,
        line1: `${10 + index} Jalan Creator`,
        line2: `Unit ${index + 1}-0${index + 2}`,
        city: index % 2 === 0 ? 'Kuala Lumpur' : 'Petaling Jaya',
        state: 'Selangor',
        postalCode: `47${100 + index}`,
        isDefault: true
      }
    });

    const product = activeProducts[index % activeProducts.length];
    if (!product) continue;

    await prisma.commerceOrder.create({
      data: {
        userId: influencer.userId,
        merchantId: product.merchantId,
        source: index % 2 === 0 ? 'AFFILIATE_LINK' : 'SELF_PURCHASE',
        status: index % 3 === 0 ? 'DELIVERED' : index % 3 === 1 ? 'SHIPPED' : 'PROCESSING',
        subtotal: product.price,
        shippingFee: index % 2 === 0 ? 0 : 12,
        total: Number(product.price) + (index % 2 === 0 ? 0 : 12),
        buyerName: address.recipientName,
        buyerPhone: address.phone,
        buyerEmail: influencer.email,
        referrerId: index % 2 === 0 ? `ref-${index + 1}` : null,
        note: index % 2 === 0 ? 'Buyer purchased from affiliate link' : 'Your personal checkout order',
        addressSnapshot: {
          id: address.id,
          label: address.label,
          recipientName: address.recipientName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode
        },
        items: {
          create: {
            productId: product.id,
            title: product.name,
            imageUrl: product.imageUrl,
            quantity: 1,
            unitPrice: product.price
          }
        }
      }
    });
  }

  const someApplications = await prisma.missionApplication.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
  const influencerUsers = await prisma.user.findMany({ where: { role: 'INFLUENCER' }, select: { id: true } });
  for (const app of someApplications.slice(0, 10)) {
    await prisma.dispute.create({
      data: {
        missionId: app.missionId,
        applicationId: app.id,
        openedById: pick(influencerUsers).id,
        reason: 'Content dispute',
        details: 'Deliverable interpretation mismatch',
        status: pick(['OPEN', 'UNDER_REVIEW', 'RESOLVED'])
      }
    });
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  for (const user of users.slice(0, 60)) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'SYSTEM',
        title: 'Welcome to KOL Mission Hub',
        message: 'Your account is ready. Explore missions and updates now.',
        isRead: rng() > 0.5
      }
    });
  }

  for (let i = 0; i < 25; i += 1) {
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: pick(['CATEGORY_CREATE', 'VERIFICATION_DECISION', 'WITHDRAWAL_STATUS_UPDATE', 'MISSION_MODERATE']),
        entityType: pick(['CATEGORY', 'INFLUENCER_PROFILE', 'WITHDRAWAL', 'MISSION']),
        entityId: null,
        metadata: { by: 'seed-script', index: i }
      }
    });
  }

  console.log('Seed completed');
  console.log('Admin login: admin@kolhub.my / Password123!');
  console.log('Merchant login example: merchant1@kolhub.my / Password123!');
  console.log('Influencer login example: influencer1@kolhub.my / Password123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
