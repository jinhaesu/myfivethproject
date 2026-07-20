// 관리 메뉴 — 직원(사용자) 목록 조회·수정.
//
// 진입 통제:
//  · 대표 계정(lion9080@joinandjoin.com)은 언제나 비밀번호 없이 진입 가능하며,
//    진입 비밀번호를 설정/변경/해제할 수 있는 유일한 계정이다.
//  · 그 외 계정은 대표가 설정해 둔 비밀번호를 입력해야 진입할 수 있다.
//    비밀번호가 아직 설정되지 않았다면 대표 외에는 아무도 진입할 수 없다.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { logUpdate } = require('../lib/changeLog');

const router = express.Router();
const prisma = new PrismaClient();

const OWNER_EMAIL = 'lion9080@joinandjoin.com';
const PASSWORD_KEY = 'admin_password_hash';
const TOKEN_SCOPE = 'admin-view';

const isOwner = (user) => String(user?.email || '').toLowerCase() === OWNER_EMAIL;

async function getPasswordHash() {
  const row = await prisma.appSetting.findUnique({ where: { key: PASSWORD_KEY } });
  return row?.value || null;
}

// X-Admin-Token 헤더에 담긴 진입 토큰이 유효한지 확인
function hasAdminToken(req) {
  const raw = req.headers['x-admin-token'];
  if (!raw) return false;
  try {
    return jwt.verify(String(raw), process.env.JWT_SECRET).scope === TOKEN_SCOPE;
  } catch {
    return false;
  }
}

// 관리 메뉴 진입 게이트 — 대표는 무조건 통과, 나머지는 진입 토큰 필요
async function requireAdminGate(req, res, next) {
  try {
    if (isOwner(req.user)) return next();
    const hash = await getPasswordHash();
    if (!hash) {
      return res.status(403).json({
        error: '관리 메뉴 진입 비밀번호가 아직 설정되지 않았습니다. 대표 계정에서 설정해주세요.',
      });
    }
    if (!hasAdminToken(req)) {
      // 403 — 로그인은 유효하고 '이 자료에 대한 추가 인증'만 부족한 상태.
      // 401을 쓰면 프론트 공용 request()가 세션 만료로 오해할 수 있어 영업일지와 관례를 맞춘다.
      return res.status(403).json({ error: '관리 메뉴 비밀번호를 입력해주세요.', passwordRequired: true });
    }
    next();
  } catch (error) {
    console.error('관리 게이트 오류:', error);
    res.status(500).json({ error: '권한 확인에 실패했습니다.' });
  }
}

// ── 게이트 상태 조회 ────────────────────────────────────────
router.get('/gate', authenticate, async (req, res) => {
  try {
    const hash = await getPasswordHash();
    const owner = isOwner(req.user);
    res.json({
      isOwner: owner,
      passwordSet: !!hash,
      // 대표는 항상 열려 있고, 그 외는 비밀번호가 설정돼 있어야 진입 시도라도 가능
      canEnter: owner || (!!hash && hasAdminToken(req)),
      blocked: !owner && !hash,
    });
  } catch (error) {
    console.error('게이트 상태 조회 오류:', error);
    res.status(500).json({ error: '상태를 불러오지 못했습니다.' });
  }
});

// ── 비밀번호 입력 → 진입 토큰 발급 ──────────────────────────
router.post('/gate/verify', authenticate, async (req, res) => {
  try {
    if (isOwner(req.user)) return res.json({ token: null, unlocked: true });
    const hash = await getPasswordHash();
    if (!hash) {
      return res.status(403).json({ error: '관리 메뉴 진입 비밀번호가 아직 설정되지 않았습니다.' });
    }
    const { password } = req.body;
    if (!password || !bcrypt.compareSync(String(password), hash)) {
      // invalidPassword 플래그로 '세션 만료'가 아님을 프론트에 알린다
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.', invalidPassword: true });
    }
    const token = jwt.sign({ scope: TOKEN_SCOPE }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, unlocked: true });
  } catch (error) {
    console.error('관리 비밀번호 확인 오류:', error);
    res.status(500).json({ error: '비밀번호 확인에 실패했습니다.' });
  }
});

// ── 비밀번호 설정/변경/해제 (대표 전용) ─────────────────────
router.put('/gate/password', authenticate, async (req, res) => {
  try {
    if (!isOwner(req.user)) {
      return res.status(403).json({ error: '진입 비밀번호는 대표 계정에서만 설정할 수 있습니다.' });
    }
    const { password } = req.body;
    // 빈 값이면 비밀번호 해제 — 해제하면 대표 외에는 아무도 진입할 수 없게 된다
    if (password === null || password === undefined || !String(password).trim()) {
      await prisma.appSetting.deleteMany({ where: { key: PASSWORD_KEY } });
      return res.json({ passwordSet: false, message: '진입 비밀번호를 해제했습니다.' });
    }
    const raw = String(password);
    if (raw.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상으로 설정해주세요.' });
    }
    const value = bcrypt.hashSync(raw, 10);
    await prisma.appSetting.upsert({
      where: { key: PASSWORD_KEY },
      update: { value },
      create: { key: PASSWORD_KEY, value },
    });
    res.json({ passwordSet: true, message: '진입 비밀번호를 설정했습니다.' });
  } catch (error) {
    console.error('관리 비밀번호 설정 오류:', error);
    res.status(500).json({ error: '비밀번호 설정에 실패했습니다.' });
  }
});

// ── 직원(사용자) 목록 ───────────────────────────────────────
router.get('/users', authenticate, requireAdminGate, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ department: 'asc' }, { name: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        name: true,
        department: true,
        role: true,
        createdAt: true,
        _count: { select: { salesJournals: true, launchProjects: true, labels: true } },
      },
    });
    res.json({
      users: users.map((u) => ({ ...u, isOwner: String(u.email).toLowerCase() === OWNER_EMAIL })),
      ownerEmail: OWNER_EMAIL,
    });
  } catch (error) {
    console.error('사용자 목록 조회 오류:', error);
    res.status(500).json({ error: '직원 목록을 불러오지 못했습니다.' });
  }
});

// ── 직원 정보 수정 (이름·부서·권한) ─────────────────────────
router.put('/users/:id', authenticate, requireAdminGate, async (req, res) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const { name, department, role } = req.body;
    const data = {};
    if (name !== undefined) data.name = String(name).trim() || null;
    if (department !== undefined) data.department = String(department).trim() || null;
    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: '권한 값이 올바르지 않습니다.' });
      }
      // 대표 계정의 권한은 실수로 낮추지 못하도록 잠근다
      if (String(existing.email).toLowerCase() === OWNER_EMAIL && role !== 'admin') {
        return res.status(400).json({ error: '대표 계정의 권한은 변경할 수 없습니다.' });
      }
      data.role = role;
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: '변경할 내용이 없습니다.' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, name: true, department: true, role: true, createdAt: true },
    });

    await logUpdate(prisma, {
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.email,
      actor: req.user,
      before: existing,
      after: data,
    });

    res.json({ user: { ...user, isOwner: String(user.email).toLowerCase() === OWNER_EMAIL } });
  } catch (error) {
    console.error('사용자 수정 오류:', error);
    res.status(500).json({ error: '직원 정보 수정에 실패했습니다.' });
  }
});

module.exports = router;
