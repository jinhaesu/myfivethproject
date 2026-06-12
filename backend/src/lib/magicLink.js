// 메일 CTA용 1회용 자동 로그인 링크 (매직 링크)
// - 허용 도메인 이메일에만 발급 (그 외에는 일반 링크 반환 → 코드 로그인 폴백)
// - 1회용 + 7일 유효, 토큰 교환은 프론트의 POST 호출로 수행 (메일 스캐너 GET 프리페치에 안전)
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

function frontendBase() {
  const raw = process.env.FRONTEND_URL || '';
  const first = raw.split(',')[0].trim().replace(/\/+$/, '');
  return first || 'https://myfivethproject.vercel.app';
}

function isAllowedEmail(email) {
  const domainRaw = process.env.ALLOWED_EMAIL_DOMAIN || process.env.ALLOWED_EMAILS || 'joinandjoin.com';
  const allowedDomains = domainRaw.split(',').map((d) => {
    const trimmed = d.trim().toLowerCase();
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  });
  const emailLower = String(email || '').toLowerCase();
  return allowedDomains.some((domain) => emailLower.endsWith(domain));
}

// 매직 링크 URL 생성. 발급 불가(도메인 불허/오류) 시 일반 링크 반환.
async function createMagicLink(email, redirectPath) {
  const plainUrl = `${frontendBase()}${redirectPath}`;
  if (!email || !isAllowedEmail(email)) return plainUrl;

  try {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.magicLinkToken.create({
      data: {
        token,
        email,
        redirectPath,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    return `${frontendBase()}/auth/magic?token=${token}&next=${encodeURIComponent(redirectPath)}`;
  } catch (err) {
    console.error('[MagicLink] 토큰 생성 실패, 일반 링크로 폴백:', err?.message || err);
    return plainUrl;
  }
}

// 만료 후 30일 지난 토큰 정리 (스케줄러에서 호출)
async function cleanupExpiredMagicLinks() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.magicLinkToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
}

module.exports = { createMagicLink, cleanupExpiredMagicLinks, isAllowedEmail, frontendBase };
