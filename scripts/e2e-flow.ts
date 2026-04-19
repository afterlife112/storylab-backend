import 'dotenv/config';
import { AddressInfo } from 'node:net';
import { buildApp } from '../src/app';
import { ensureDefaultSettings, getFinanceSettings } from '../src/services/settings.service';
import { prisma } from '../src/lib/prisma';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

type Session = {
  token: string;
  user: { id: string; email: string; role: string };
};

const run = async () => {
  await ensureDefaultSettings();
  const app = buildApp();
  const server = app.listen(0);
  const baseUrl = await new Promise<string>((resolve) => {
    server.on('listening', () => {
      const port = (server.address() as AddressInfo).port;
      resolve(`http://127.0.0.1:${port}`);
    });
  });

  const request = async <T>(
    method: string,
    path: string,
    options?: { token?: string; body?: unknown; formData?: FormData; expectText?: boolean }
  ): Promise<T> => {
    const headers: Record<string, string> = {};
    if (options?.token) headers.Authorization = `Bearer ${options.token}`;

    let body: BodyInit | undefined;
    if (options?.formData) {
      body = options.formData;
    } else if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${baseUrl}${path}`, { method, headers, body });

    if (options?.expectText) {
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
      return text as T;
    }

    const json = (await response.json()) as { success: boolean; data: T; error: { message: string } | null };
    if (!response.ok || !json.success) {
      throw new Error(`HTTP ${response.status} ${path}: ${json.error?.message ?? 'unknown error'}`);
    }
    return json.data;
  };

  const login = async (email: string, password: string): Promise<Session> => {
    const data = await request<{ accessToken: string; user: any }>('POST', '/auth/login', {
      body: { email, password }
    });
    return { token: data.accessToken, user: data.user };
  };

  let adminToken: string | null = null;
  let originalFinance: { platformFeePercent: number; pointsToMyrRate: number; minWithdrawalMyr: number } | null = null;

  try {
    const categories = await request<any[]>('GET', '/public/categories');
    assert(categories.length >= 12, 'public categories should contain at least 12 rows');
    const chinese = ['开箱', '探店', '带人', '真实评价'];
    for (const name of chinese) {
      assert(categories.some((c) => c.name === name), `category ${name} should exist`);
    }

    const merchant = await login('merchant1@kolhub.my', 'Password123!');
    const influencer = await login('influencer1@kolhub.my', 'Password123!');
    const admin = await login('admin@kolhub.my', 'Password123!');
    adminToken = admin.token;

    const walletBefore = await request<any>('GET', '/merchant/wallet', { token: merchant.token });
    const topupAmount = 88;
    const topupIntent = await request<{ paymentUrl: string; referenceId: string }>('POST', '/merchant/wallet/topup-intent', {
      token: merchant.token,
      body: { amount: topupAmount }
    });
    assert(topupIntent.referenceId.startsWith('RM-'), 'topup reference should be generated');
    await request<string>('GET', `/dev/mock-pay/${topupIntent.referenceId}`, { expectText: true });
    const walletAfterTopup = await request<any>('GET', '/merchant/wallet', { token: merchant.token });
    assert(
      Number(walletAfterTopup.balance) >= Number(walletBefore.balance) + topupAmount,
      'wallet should be credited after mock payment'
    );

    const missionDraft = await request<any>('POST', '/merchant/missions', {
      token: merchant.token,
      body: {
        categoryId: categories[0].id,
        title: `E2E Mission ${Date.now()}`,
        description: 'Integration flow mission description for full end-to-end verification.',
        platformRequirements: ['IG', 'TikTok'],
        deliverablesChecklist: ['1 Reel', '3 Story Frames', 'Analytics Screenshot'],
        location: 'Kuala Lumpur',
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        quota: 3,
        pricingMode: 'FIXED_BUDGET',
        fixedBudgetAmount: 300
      }
    });
    assert(missionDraft.status === 'DRAFT', 'mission should start in DRAFT');

    const missionPublished = await request<any>('PATCH', `/merchant/missions/${missionDraft.id}/status`, {
      token: merchant.token,
      body: { status: 'PUBLISHED' }
    });
    assert(missionPublished.status === 'PUBLISHED', 'mission should publish successfully');

    const otpData = await request<{ code: string }>('POST', '/influencer/otp/request', {
      token: influencer.token,
      body: { phone: '60135555101' }
    });
    assert(otpData.code === '123456', 'mock OTP should be deterministic');
    await request('POST', '/influencer/otp/verify', {
      token: influencer.token,
      body: { phone: '60135555101', code: '123456' }
    });

    const discovery = await request<any>(
      'GET',
      `/influencer/missions?page=1&pageSize=20&search=${encodeURIComponent(missionDraft.title)}`,
      {
        token: influencer.token
      }
    );
    const discoverMission = discovery.items.find((m: any) => m.id === missionDraft.id);
    assert(Boolean(discoverMission), 'influencer should discover newly published mission');

    await request<any>('POST', '/influencer/missions/apply', {
      token: influencer.token,
      body: { missionId: missionDraft.id }
    });

    const applicants = await request<any[]>(`GET`, `/merchant/missions/${missionDraft.id}/applicants`, {
      token: merchant.token
    });
    const application = applicants.find((a) => a.influencer.userId === influencer.user.id);
    assert(Boolean(application), 'merchant should see influencer application');

    await request<any>('PATCH', `/merchant/applications/${application.id}/decision`, {
      token: merchant.token,
      body: { status: 'ACCEPTED' }
    });

    const form = new FormData();
    form.append('applicationId', application.id);
    form.append('links', JSON.stringify(['https://instagram.com/p/e2e-proof-1']));
    form.append('caption', 'Mission delivery proof caption');
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQfW4uoAAAAASUVORK5CYII=',
      'base64'
    );
    form.append('proofImages', new Blob([pngBytes], { type: 'image/png' }), 'proof.png');

    const submission = await request<any>('POST', '/influencer/submissions', {
      token: influencer.token,
      formData: form
    });
    assert(submission.status === 'SUBMITTED', 'submission should be created as SUBMITTED');

    const submissions = await request<any[]>(`GET`, `/merchant/missions/${missionDraft.id}/submissions`, {
      token: merchant.token
    });
    const targetSubmission = submissions.find((s) => s.id === submission.id);
    assert(Boolean(targetSubmission), 'merchant should see submitted proof');

    const approvedSubmission = await request<any>('PATCH', `/merchant/submissions/${submission.id}/review`, {
      token: merchant.token,
      body: {
        status: 'APPROVED',
        reviewNote: 'Approved in E2E test'
      }
    });
    assert(approvedSubmission.status === 'APPROVED', 'submission should become APPROVED');

    await request<any>('POST', '/merchant/reviews', {
      token: merchant.token,
      body: {
        missionId: missionDraft.id,
        submissionId: submission.id,
        influencerId: application.influencerId,
        star: 5,
        comment: 'Excellent collaboration from E2E run'
      }
    });

    const chatThreads = await request<any[]>('GET', '/influencer/chats', { token: influencer.token });
    const thread = chatThreads.find((c) => c.applicationId === application.id);
    assert(Boolean(thread), 'chat thread should exist after application acceptance');

    await request<any>('POST', `/influencer/chats/${application.id}/messages`, {
      token: influencer.token,
      body: { content: 'Hello merchant, submission completed.' }
    });
    const merchantChat = await request<any>('GET', `/merchant/chats/${application.id}/messages?page=1&pageSize=20`, {
      token: merchant.token
    });
    assert(
      merchantChat.items.some((m: any) => m.content.includes('submission completed')),
      'merchant should receive influencer chat message'
    );

    const dispute = await request<any>('POST', '/influencer/disputes', {
      token: influencer.token,
      body: {
        applicationId: application.id,
        reason: 'Compensation clarification',
        details: 'Need clarification on payout schedule'
      }
    });

    const disputes = await request<any>('GET', '/admin/disputes?page=1&pageSize=20', { token: admin.token });
    assert(disputes.items.some((d: any) => d.id === dispute.id), 'admin should see opened dispute');
    await request<any>('PATCH', `/admin/disputes/${dispute.id}`, {
      token: admin.token,
      body: { status: 'RESOLVED', resolutionNote: 'Resolved by admin during E2E test' }
    });

    const dashboard = await request<any>('GET', '/admin/dashboard', { token: admin.token });
    assert(dashboard.activeMissions >= 1, 'dashboard activeMissions should be non-zero');

    const verifications = await request<any>('GET', '/admin/verifications?page=1&pageSize=20', { token: admin.token });
    const pendingVerification = verifications.items.find((v: any) => v.verificationStatus === 'PENDING');
    if (pendingVerification) {
      await request<any>('PATCH', `/admin/verifications/${pendingVerification.id}`, {
        token: admin.token,
        body: { status: 'APPROVED', notes: 'Approved in E2E test' }
      });
    }

    const createdCategory = await request<any>('POST', '/admin/categories', {
      token: admin.token,
      body: { name: `E2E-CAT-${Date.now()}`, sortOrder: 999, isEnabled: true }
    });
    await request<any>('PUT', `/admin/categories/${createdCategory.id}`, {
      token: admin.token,
      body: { name: `${createdCategory.name}-UPDATED`, sortOrder: 998, isEnabled: true }
    });
    await request<any>('DELETE', `/admin/categories/${createdCategory.id}`, { token: admin.token });

    const users = await request<any>('GET', '/admin/users?page=1&pageSize=20&role=INFLUENCER', { token: admin.token });
    const targetUser = users.items.find((u: any) => u.id !== influencer.user.id);
    if (targetUser) {
      await request<any>('PATCH', `/admin/users/${targetUser.id}/status`, {
        token: admin.token,
        body: { status: 'BANNED' }
      });
      await request<any>('PATCH', `/admin/users/${targetUser.id}/status`, {
        token: admin.token,
        body: { status: 'ACTIVE' }
      });
    }

    const finance = await request<any>('GET', '/admin/finance/settings', { token: admin.token });
    originalFinance = finance;
    await request<any>('PATCH', '/admin/finance/settings', {
      token: admin.token,
      body: {
        platformFeePercent: finance.platformFeePercent,
        pointsToMyrRate: 1,
        minWithdrawalMyr: 1
      }
    });

    const earnings = await request<any>('GET', '/influencer/earnings?page=1&pageSize=20', { token: influencer.token });
    assert(earnings.balancePoints >= 1, 'influencer should have points to withdraw');

    const withdrawal = await request<any>('POST', '/influencer/withdrawals', {
      token: influencer.token,
      body: { points: 1 }
    });

    await request<any>('PATCH', `/admin/withdrawals/${withdrawal.id}`, {
      token: admin.token,
      body: { status: 'APPROVED', adminNotes: 'Approved in E2E' }
    });
    await request<any>('PATCH', `/admin/withdrawals/${withdrawal.id}`, {
      token: admin.token,
      body: { status: 'PAID', payoutRef: `E2E-${Date.now()}`, adminNotes: 'Paid in E2E' }
    });

    const influencerWithdrawals = await request<any>('GET', '/influencer/withdrawals?page=1&pageSize=20', {
      token: influencer.token
    });
    const paid = influencerWithdrawals.items.find((w: any) => w.id === withdrawal.id);
    assert(paid?.status === 'PAID', 'withdrawal should be PAID after admin action');

    const suspended = await request<any>('PATCH', `/admin/missions/${missionDraft.id}/moderate`, {
      token: admin.token,
      body: { suspended: true, reason: 'Temporary moderation test' }
    });
    assert(suspended.status === 'SUSPENDED', 'mission should be suspended by admin');

    const unsuspended = await request<any>('PATCH', `/admin/missions/${missionDraft.id}/moderate`, {
      token: admin.token,
      body: { suspended: false }
    });
    assert(['PUBLISHED', 'IN_PROGRESS'].includes(unsuspended.status), 'mission should be unsuspended by admin');

    const notifications = await request<any>('GET', '/merchant/notifications?page=1&pageSize=10', { token: merchant.token });
    assert(notifications.items.length > 0, 'merchant should have in-app notifications');

    const audit = await request<any>('GET', '/admin/audit-logs?page=1&pageSize=20', { token: admin.token });
    assert(audit.items.length > 0, 'admin audit logs should have records');

    if (adminToken && originalFinance) {
      await request<any>('PATCH', '/admin/finance/settings', {
        token: adminToken,
        body: originalFinance
      });
      originalFinance = null;
    }
    const nowFinance = await getFinanceSettings();
    console.log('E2E PASS');
    console.log(
      JSON.stringify(
        {
          checked: {
            categories: categories.length,
            missionId: missionDraft.id,
            applicationId: application.id,
            submissionId: submission.id,
            disputeId: dispute.id,
            withdrawalId: withdrawal.id,
            financeSettings: nowFinance
          }
        },
        null,
        2
      )
    );
  } finally {
    if (adminToken && originalFinance) {
      try {
        await request<any>('PATCH', '/admin/finance/settings', {
          token: adminToken,
          body: originalFinance
        });
      } catch (restoreError) {
        console.error('Failed to restore finance settings:', restoreError);
      }
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await prisma.$disconnect();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
