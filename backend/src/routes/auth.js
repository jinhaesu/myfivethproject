const express = require('express');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 인증 코드 발송
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: '이메일을 입력해주세요.' });
    }

    const domainRaw = process.env.ALLOWED_EMAIL_DOMAIN || process.env.ALLOWED_EMAILS || 'joinandjoin.com';
    const allowedDomains = domainRaw.split(',').map(d => {
      const trimmed = d.trim().toLowerCase();
      return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    });
    const emailLower = email.toLowerCase();
    if (!allowedDomains.some(domain => emailLower.endsWith(domain))) {
      return res.status(403).json({ error: `${allowedDomains.join(', ')} 이메일만 사용할 수 있습니다.` });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분

    let user = await prisma.user.findUnique({ where: { email } });

    await prisma.emailVerification.create({
      data: {
        email,
        code,
        expiresAt,
        userId: user?.id,
      },
    });

    const resend = getResend();
    if (resend) {
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'noreply@joinandjoin.com',
          to: email,
          subject: '[영양성분 표기사항 관리] 인증 코드',
          html: `
            <div style="padding: 20px; font-family: sans-serif;">
              <h2>이메일 인증</h2>
              <p>아래 인증 코드를 입력해주세요:</p>
              <div style="font-size: 32px; font-weight: bold; color: #5E6AD2; margin: 20px 0; letter-spacing: 8px;">
                ${code}
              </div>
              <p style="color: #666;">이 코드는 10분간 유효합니다.</p>
            </div>
          `,
        });
      } catch (mailErr) {
        // 메일 전송 실패해도 인증코드는 DB에 저장된 상태이므로 200 응답을 유지하되 로그로 알린다.
        console.error('[Resend] 인증코드 메일 전송 실패:', mailErr?.message || mailErr);
      }
    } else {
      console.log(`[DEV] Verification code for ${email}: ${code}`);
    }

    res.json({ message: '인증 코드가 발송되었습니다.' });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: '인증 코드 발송에 실패했습니다.' });
  }
});

// 인증 코드 검증 및 로그인
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: '이메일과 인증 코드를 입력해주세요.' });
    }

    const verification = await prisma.emailVerification.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      return res.status(400).json({ error: '유효하지 않은 인증 코드입니다.' });
    }

    await prisma.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email },
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: '인증에 실패했습니다.' });
  }
});

// 사용자 프로필 조회
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      department: req.user.department,
      role: req.user.role,
    },
  });
});

// 사용자 프로필 업데이트
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, department } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, department },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: '프로필 업데이트에 실패했습니다.' });
  }
});

module.exports = router;
