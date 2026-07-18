const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const storage = require('../lib/storage');
const {
  SALES_STAGES,
  SALES_STAGE_KEYS,
  STAGE_DEFAULT_PROB,
  isSuperAdmin,
  canViewJournal,
  isJournalOwner,
  normalizeStage,
} = require('../lib/sales');

const router = express.Router();
const prisma = new PrismaClient();

// ── 명함 이미지 업로드용 multer (이미지 전용) ──────────────
const cardDir = path.join(__dirname, '..', '..', 'uploads', 'sales-cards');
if (!fs.existsSync(cardDir)) fs.mkdirSync(cardDir, { recursive: true });

const cardMulter = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, cardDir),
    filename: (req, file, cb) => {
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `card-${suffix}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('명함은 이미지 파일(PNG, JPG, WebP)만 업로드 가능합니다.'), ok);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── 영업일지 첨부(제안서·명함 등) multer ──────────────────
const attachDir = path.join(__dirname, '..', '..', 'uploads', 'sales-attachments');
if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });

const ATTACH_MIME = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/haansofthwp', 'application/x-hwp', 'application/octet-stream',
];

const attachMulter = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, attachDir),
    filename: (req, file, cb) => {
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `attach-${suffix}${path.extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ok = ATTACH_MIME.includes(file.mimetype);
    cb(ok ? null : new Error('지원하지 않는 파일 형식입니다. (PDF·이미지·오피스 문서만 가능)'), ok);
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

const USER_SELECT = { id: true, name: true, email: true, department: true };

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// 예상매출(원): 콤마·공백 허용, 숫자 아니면 null
function parseRevenue(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}

// 성사 확률(%): 0~100 클램프
function parseProb(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
}

// ============================================================
// 메타: 파이프라인 단계 목록
// ============================================================
router.get('/meta/stages', authenticate, (req, res) => {
  res.json({ stages: SALES_STAGES });
});

// ============================================================
// 거래처 (Clients) — 팀 공유 마스터 데이터
// ============================================================
const CLIENT_INCLUDE = {
  createdBy: { select: USER_SELECT },
  contacts: { orderBy: { sortOrder: 'asc' } },
  _count: { select: { journals: true, plans: true } },
};

router.get('/clients', authenticate, async (req, res) => {
  try {
    const clients = await prisma.salesClient.findMany({
      orderBy: { updatedAt: 'desc' },
      include: CLIENT_INCLUDE,
    });
    res.json({ clients });
  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({ error: '거래처 목록 조회에 실패했습니다.' });
  }
});

router.post('/clients', authenticate, async (req, res) => {
  try {
    const {
      name, bizNumber, stage, ownerOrg, buyerComposition, annualRevenue,
      existingVendors, managedItems, storageCondition, logisticsCondition, note,
      expectedRevenue, winProbability,
    } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '거래처명을 입력해주세요.' });
    }
    const client = await prisma.salesClient.create({
      data: {
        name: String(name).trim(),
        bizNumber: bizNumber || null,
        stage: normalizeStage(stage),
        expectedRevenue: parseRevenue(expectedRevenue),
        winProbability: parseProb(winProbability),
        ownerOrg: ownerOrg || null,
        buyerComposition: buyerComposition || null,
        annualRevenue: annualRevenue || null,
        existingVendors: existingVendors || null,
        managedItems: managedItems || null,
        storageCondition: storageCondition || null,
        logisticsCondition: logisticsCondition || null,
        note: note || null,
        createdById: req.user.id,
      },
      include: CLIENT_INCLUDE,
    });
    res.json({ client });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: '거래처 등록에 실패했습니다.' });
  }
});

router.get('/clients/:id', authenticate, async (req, res) => {
  try {
    const client = await prisma.salesClient.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: USER_SELECT },
        contacts: { orderBy: { sortOrder: 'asc' } },
        journals: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: USER_SELECT },
            referrers: true,
            todos: { orderBy: { dueDate: 'asc' } },
          },
        },
        plans: {
          orderBy: { planDate: 'asc' },
          include: { author: { select: USER_SELECT } },
        },
      },
    });
    if (!client) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });
    // 일지는 열람 권한 있는 것만, 잠금 여부 표기
    client.journals = client.journals
      .filter((j) => canViewJournal(req.user, j))
      .map((j) => sanitizeJournalListItem(req.user, j));
    res.json({ client });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: '거래처 조회에 실패했습니다.' });
  }
});

router.put('/clients/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.salesClient.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });
    const b = req.body;
    const data = {};
    const fields = [
      'name', 'bizNumber', 'ownerOrg', 'buyerComposition', 'annualRevenue',
      'existingVendors', 'managedItems', 'storageCondition', 'logisticsCondition', 'note',
    ];
    for (const f of fields) {
      if (b[f] !== undefined) data[f] = b[f] || null;
    }
    if (b.name !== undefined && !String(b.name).trim()) {
      return res.status(400).json({ error: '거래처명은 비울 수 없습니다.' });
    }
    if (b.stage !== undefined) data.stage = normalizeStage(b.stage);
    if (b.expectedRevenue !== undefined) data.expectedRevenue = parseRevenue(b.expectedRevenue);
    if (b.winProbability !== undefined) data.winProbability = parseProb(b.winProbability);
    const client = await prisma.salesClient.update({
      where: { id: req.params.id },
      data,
      include: CLIENT_INCLUDE,
    });
    res.json({ client });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: '거래처 수정에 실패했습니다.' });
  }
});

router.delete('/clients/:id', authenticate, async (req, res) => {
  try {
    await prisma.salesClient.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: '거래처 삭제에 실패했습니다.' });
  }
});

// ============================================================
// 거래처 담당자 명함 (Contacts)
// ============================================================
router.post('/clients/:clientId/contacts', authenticate, async (req, res) => {
  try {
    const client = await prisma.salesClient.findUnique({ where: { id: req.params.clientId } });
    if (!client) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });
    const { name, position, title, phone, email } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '담당자 이름을 입력해주세요.' });
    }
    const count = await prisma.salesContact.count({ where: { clientId: client.id } });
    const contact = await prisma.salesContact.create({
      data: {
        clientId: client.id,
        name: String(name).trim(),
        position: position || null,
        title: title || null,
        phone: phone || null,
        email: email || null,
        sortOrder: count,
      },
    });
    res.json({ contact });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: '담당자 등록에 실패했습니다.' });
  }
});

router.put('/contacts/:id', authenticate, async (req, res) => {
  try {
    const b = req.body;
    const data = {};
    for (const f of ['name', 'position', 'title', 'phone', 'email']) {
      if (b[f] !== undefined) data[f] = b[f] || null;
    }
    if (b.name !== undefined && !String(b.name).trim()) {
      return res.status(400).json({ error: '담당자 이름은 비울 수 없습니다.' });
    }
    const contact = await prisma.salesContact.update({ where: { id: req.params.id }, data });
    res.json({ contact });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: '담당자 수정에 실패했습니다.' });
  }
});

router.delete('/contacts/:id', authenticate, async (req, res) => {
  try {
    const contact = await prisma.salesContact.findUnique({ where: { id: req.params.id } });
    if (contact?.cardImageUrl) {
      const key = contact.cardImageUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(key); } catch (e) { console.error('card delete:', e.message); }
    }
    await prisma.salesContact.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: '담당자 삭제에 실패했습니다.' });
  }
});

// 명함 이미지 업로드
router.post('/contacts/:id/card', authenticate, cardMulter.single('cardImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '명함 이미지를 선택해주세요.' });
    const contact = await prisma.salesContact.findUnique({ where: { id: req.params.id } });
    if (!contact) {
      fs.existsSync(req.file.path) && fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '담당자를 찾을 수 없습니다.' });
    }
    if (contact.cardImageUrl) {
      const oldKey = contact.cardImageUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(oldKey); } catch (e) { console.error('old card:', e.message); }
    }
    const key = `sales-cards/${req.file.filename}`;
    const fileUrl = `/uploads/sales-cards/${req.file.filename}`;
    await storage.uploadFile(key, req.file.path, req.file.mimetype);
    const updated = await prisma.salesContact.update({
      where: { id: contact.id },
      data: { cardImageUrl: fileUrl, cardImageName: req.file.originalname },
    });
    res.json({ contact: updated });
  } catch (error) {
    console.error('Card upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message || '명함 업로드에 실패했습니다.' });
  }
});

// ============================================================
// 영업일지 (Journals) — 참고자·비밀번호로 열람 제어
// ============================================================

// 목록 아이템: 잠금이면 본문 제외
function sanitizeJournalListItem(user, j) {
  const owner = isJournalOwner(user, j);
  const locked = !!j.passwordHash && !owner;
  const { passwordHash, ...rest } = j;
  return {
    ...rest,
    passwordProtected: !!passwordHash,
    canEdit: owner,
    locked,
    // 잠금 상태면 상세 본문은 상세 조회에서 비번 검증 후 제공
    meetingSummary: locked ? null : rest.meetingSummary,
    keyRequests: locked ? null : rest.keyRequests,
    productRequests: locked ? null : rest.productRequests,
    attachments: locked ? [] : (rest.attachments || []),
    attachmentCount: (rest.attachments || []).length,
  };
}

function hasJournalViewToken(req, journal) {
  const token = req.headers['x-journal-token'];
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.scope === 'journal-view' && decoded.journalId === journal.id;
  } catch {
    return false;
  }
}

// 목록 (내가 볼 수 있는 일지: 작성자 · 참고자 · 최고관리자), clientId 필터 옵션
router.get('/journals', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.clientId) where.clientId = String(req.query.clientId);
    const all = await prisma.salesJournal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: USER_SELECT },
        client: { select: { id: true, name: true, stage: true } },
        referrers: true,
        todos: { orderBy: { dueDate: 'asc' } },
        attachments: { orderBy: { sortOrder: 'asc' } },
      },
    });
    const visible = all
      .filter((j) => canViewJournal(req.user, j))
      .map((j) => sanitizeJournalListItem(req.user, j));
    res.json({ journals: visible, isSuperAdmin: isSuperAdmin(req.user) });
  } catch (error) {
    console.error('List journals error:', error);
    res.status(500).json({ error: '영업일지 목록 조회에 실패했습니다.' });
  }
});

// 생성 — referrers[](이메일 문자열), todos[]({dueDate,content,plan?,isDone?})
router.post('/journals', authenticate, async (req, res) => {
  try {
    const {
      clientId, title, password, isFirstMeeting, stage, meetingDate, meetingPurpose,
      meetingLocation, attendees, meetingSummary, keyRequests, productRequests,
      referrers, todos,
    } = req.body;
    if (!clientId) return res.status(400).json({ error: '거래처를 지정해주세요.' });
    const client = await prisma.salesClient.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });

    const passwordHash =
      password && String(password).trim() ? bcrypt.hashSync(String(password), 10) : null;

    const referrerEmails = Array.isArray(referrers)
      ? [...new Set(referrers.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
      : [];
    const todoData = Array.isArray(todos)
      ? todos
          .map((t) => ({ dueDate: parseDate(t.dueDate), content: String(t.content || '').trim(), plan: t.plan || null, isDone: !!t.isDone }))
          .filter((t) => t.dueDate && t.content)
      : [];

    const journal = await prisma.salesJournal.create({
      data: {
        clientId,
        authorId: req.user.id,
        title: title || null,
        passwordHash,
        isFirstMeeting: !!isFirstMeeting,
        stage: stage || null,
        meetingDate: parseDate(meetingDate),
        meetingPurpose: meetingPurpose || null,
        meetingLocation: meetingLocation || null,
        attendees: attendees || null,
        meetingSummary: meetingSummary || null,
        keyRequests: keyRequests || null,
        productRequests: productRequests || null,
        referrers: { create: referrerEmails.map((email) => ({ email })) },
        todos: { create: todoData },
      },
      include: { referrers: true, todos: true },
    });
    // 작성 시 거래처 단계 동기화 (일지에 단계가 지정된 경우)
    if (stage) {
      await prisma.salesClient.update({ where: { id: clientId }, data: { stage: normalizeStage(stage) } });
    }
    res.json({ journal: { ...journal, passwordProtected: !!passwordHash } });
  } catch (error) {
    console.error('Create journal error:', error);
    res.status(500).json({ error: '영업일지 작성에 실패했습니다.' });
  }
});

// 상세 — 열람 권한 + (참고자이면서 비번설정 시) 뷰 토큰 필요
router.get('/journals/:id', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: USER_SELECT },
        client: true,
        referrers: true,
        todos: { orderBy: { dueDate: 'asc' } },
        attachments: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!canViewJournal(req.user, journal)) {
      return res.status(403).json({ error: '이 영업일지를 열람할 권한이 없습니다.' });
    }
    const owner = isJournalOwner(req.user, journal);
    // 참고자이면서 비밀번호가 걸린 경우 뷰 토큰 필요
    if (!owner && journal.passwordHash && !hasJournalViewToken(req, journal)) {
      const { passwordHash, meetingSummary, keyRequests, productRequests, attendees, todos, attachments, ...safe } = journal;
      return res.status(403).json({
        error: '열람 비밀번호가 필요합니다.',
        passwordRequired: true,
        journal: { ...safe, passwordProtected: true, canEdit: false, locked: true },
      });
    }
    const { passwordHash, ...rest } = journal;
    res.json({
      journal: { ...rest, passwordProtected: !!passwordHash, canEdit: owner, locked: false },
    });
  } catch (error) {
    console.error('Get journal error:', error);
    res.status(500).json({ error: '영업일지 조회에 실패했습니다.' });
  }
});

// 열람 비밀번호 검증 → 뷰 토큰 발급
router.post('/journals/:id/verify-password', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({
      where: { id: req.params.id },
      include: { referrers: true },
    });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!canViewJournal(req.user, journal)) {
      return res.status(403).json({ error: '이 영업일지를 열람할 권한이 없습니다.' });
    }
    if (!journal.passwordHash) return res.json({ token: null, unlocked: true });
    const { password } = req.body;
    if (!password || !bcrypt.compareSync(String(password), journal.passwordHash)) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }
    const token = jwt.sign(
      { scope: 'journal-view', journalId: journal.id },
      process.env.JWT_SECRET,
      { expiresIn: '12h' },
    );
    res.json({ token, unlocked: true });
  } catch (error) {
    console.error('Verify journal password error:', error);
    res.status(500).json({ error: '비밀번호 확인에 실패했습니다.' });
  }
});

// 수정 (작성자 · 최고관리자) — referrers/todos 전체 교체
router.put('/journals/:id', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({ where: { id: req.params.id } });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, journal)) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const b = req.body;
    const data = {};
    for (const f of ['title', 'meetingPurpose', 'meetingLocation', 'attendees', 'meetingSummary', 'keyRequests', 'productRequests', 'stage']) {
      if (b[f] !== undefined) data[f] = b[f] || null;
    }
    if (b.isFirstMeeting !== undefined) data.isFirstMeeting = !!b.isFirstMeeting;
    if (b.meetingDate !== undefined) data.meetingDate = parseDate(b.meetingDate);
    // 비밀번호: 문자열이면 재설정, 빈문자열 명시면 해제, undefined면 유지
    if (b.password !== undefined) {
      data.passwordHash = b.password && String(b.password).trim() ? bcrypt.hashSync(String(b.password), 10) : null;
    }
    // referrers 교체
    const ops = [];
    if (Array.isArray(b.referrers)) {
      const emails = [...new Set(b.referrers.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
      ops.push(prisma.salesJournalReferrer.deleteMany({ where: { journalId: journal.id } }));
      if (emails.length) {
        ops.push(prisma.salesJournalReferrer.createMany({ data: emails.map((email) => ({ journalId: journal.id, email })) }));
      }
    }
    if (Array.isArray(b.todos)) {
      const todoData = b.todos
        .map((t) => ({ journalId: journal.id, dueDate: parseDate(t.dueDate), content: String(t.content || '').trim(), plan: t.plan || null, isDone: !!t.isDone }))
        .filter((t) => t.dueDate && t.content);
      ops.push(prisma.salesTodo.deleteMany({ where: { journalId: journal.id } }));
      if (todoData.length) ops.push(prisma.salesTodo.createMany({ data: todoData }));
    }
    ops.push(prisma.salesJournal.update({ where: { id: journal.id }, data }));
    await prisma.$transaction(ops);
    if (b.stage) {
      await prisma.salesClient.update({ where: { id: journal.clientId }, data: { stage: normalizeStage(b.stage) } });
    }
    const updated = await prisma.salesJournal.findUnique({
      where: { id: journal.id },
      include: { author: { select: USER_SELECT }, client: true, referrers: true, todos: { orderBy: { dueDate: 'asc' } }, attachments: { orderBy: { sortOrder: 'asc' } } },
    });
    const { passwordHash, ...rest } = updated;
    res.json({ journal: { ...rest, passwordProtected: !!passwordHash, canEdit: true, locked: false } });
  } catch (error) {
    console.error('Update journal error:', error);
    res.status(500).json({ error: '영업일지 수정에 실패했습니다.' });
  }
});

router.delete('/journals/:id', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({ where: { id: req.params.id } });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, journal)) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.salesJournal.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete journal error:', error);
    res.status(500).json({ error: '영업일지 삭제에 실패했습니다.' });
  }
});

// 첨부 업로드 (제안서·명함 등) — 작성자/최고관리자만
router.post('/journals/:id/attachments', authenticate, attachMulter.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일을 선택해주세요.' });
    const journal = await prisma.salesJournal.findUnique({ where: { id: req.params.id } });
    if (!journal) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    }
    if (!isJournalOwner(req.user, journal)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: '첨부 권한이 없습니다.' });
    }
    const kind = req.query.kind === 'card' ? 'card' : req.query.kind === 'etc' ? 'etc' : 'proposal';
    const key = `sales-attachments/${req.file.filename}`;
    const fileUrl = `/uploads/sales-attachments/${req.file.filename}`;
    await storage.uploadFile(key, req.file.path, req.file.mimetype);
    const count = await prisma.salesJournalAttachment.count({ where: { journalId: journal.id } });
    const attachment = await prisma.salesJournalAttachment.create({
      data: {
        journalId: journal.id,
        kind,
        fileUrl,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        sortOrder: count,
      },
    });
    res.json({ attachment });
  } catch (error) {
    console.error('Attachment upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message || '첨부 업로드에 실패했습니다.' });
  }
});

router.delete('/attachments/:id', authenticate, async (req, res) => {
  try {
    const attachment = await prisma.salesJournalAttachment.findUnique({
      where: { id: req.params.id },
      include: { journal: true },
    });
    if (!attachment) return res.status(404).json({ error: '첨부를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, attachment.journal)) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    if (attachment.fileUrl) {
      const key = attachment.fileUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(key); } catch (e) { console.error('attach file delete:', e.message); }
    }
    await prisma.salesJournalAttachment.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: '첨부 삭제에 실패했습니다.' });
  }
});

// 할일 완료 토글
router.put('/todos/:id', authenticate, async (req, res) => {
  try {
    const todo = await prisma.salesTodo.findUnique({ where: { id: req.params.id }, include: { journal: true } });
    if (!todo) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, todo.journal)) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const updated = await prisma.salesTodo.update({
      where: { id: req.params.id },
      data: { isDone: req.body.isDone !== undefined ? !!req.body.isDone : !todo.isDone },
    });
    res.json({ todo: updated });
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({ error: '할일 수정에 실패했습니다.' });
  }
});

// ============================================================
// 영업계획 (Plans)
// ============================================================
router.get('/plans', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.query.clientId) where.clientId = String(req.query.clientId);
    const plans = await prisma.salesPlan.findMany({
      where,
      orderBy: { planDate: 'asc' },
      include: { author: { select: USER_SELECT }, client: { select: { id: true, name: true } } },
    });
    res.json({ plans });
  } catch (error) {
    console.error('List plans error:', error);
    res.status(500).json({ error: '영업계획 목록 조회에 실패했습니다.' });
  }
});

router.post('/plans', authenticate, async (req, res) => {
  try {
    const { clientId, title, planDate, content, stage } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: '계획 제목을 입력해주세요.' });
    const date = parseDate(planDate);
    if (!date) return res.status(400).json({ error: '계획 일정을 입력해주세요.' });
    const plan = await prisma.salesPlan.create({
      data: {
        title: String(title).trim(),
        planDate: date,
        content: content || null,
        stage: stage || null,
        clientId: clientId || null,
        authorId: req.user.id,
      },
      include: { author: { select: USER_SELECT }, client: { select: { id: true, name: true } } },
    });
    res.json({ plan });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: '영업계획 등록에 실패했습니다.' });
  }
});

router.put('/plans/:id', authenticate, async (req, res) => {
  try {
    const b = req.body;
    const data = {};
    if (b.title !== undefined) {
      if (!String(b.title).trim()) return res.status(400).json({ error: '계획 제목은 비울 수 없습니다.' });
      data.title = String(b.title).trim();
    }
    if (b.planDate !== undefined) {
      const d = parseDate(b.planDate);
      if (!d) return res.status(400).json({ error: '유효한 일정을 입력해주세요.' });
      data.planDate = d;
    }
    if (b.content !== undefined) data.content = b.content || null;
    if (b.stage !== undefined) data.stage = b.stage || null;
    if (b.clientId !== undefined) data.clientId = b.clientId || null;
    const plan = await prisma.salesPlan.update({
      where: { id: req.params.id },
      data,
      include: { author: { select: USER_SELECT }, client: { select: { id: true, name: true } } },
    });
    res.json({ plan });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: '영업계획 수정에 실패했습니다.' });
  }
});

router.delete('/plans/:id', authenticate, async (req, res) => {
  try {
    await prisma.salesPlan.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: '영업계획 삭제에 실패했습니다.' });
  }
});

// ============================================================
// 통합 캘린더 — 출시/단종/영업미팅/영업계획/할일 집계
// ============================================================
router.get('/calendar', authenticate, async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const inRange = (field) => {
      const c = {};
      if (from) c.gte = from;
      if (to) c.lte = to;
      return Object.keys(c).length ? { [field]: c } : { [field]: { not: null } };
    };

    const events = [];

    // 출시/단종 프로젝트 (targetLaunchDate)
    const projects = await prisma.launchProject.findMany({
      where: inRange('targetLaunchDate'),
      select: { id: true, kind: true, productName: true, targetLaunchDate: true, status: true },
    });
    for (const p of projects) {
      events.push({
        id: `project-${p.id}`,
        type: p.kind === 'discontinuation' ? 'discontinuation' : 'launch',
        title: p.productName,
        date: p.targetLaunchDate,
        status: p.status,
        url: `/launches/${p.id}`,
      });
    }

    // 영업 미팅 (일지 meetingDate) + 향후 스케쥴 할일 — 열람 권한 필터
    const journals = await prisma.salesJournal.findMany({
      include: {
        client: { select: { id: true, name: true } },
        referrers: true,
        todos: true,
        author: { select: USER_SELECT },
      },
    });
    for (const j of journals) {
      if (!canViewJournal(req.user, j)) continue;
      if (j.meetingDate && inDateRange(j.meetingDate, from, to)) {
        events.push({
          id: `meeting-${j.id}`,
          type: 'meeting',
          title: `${j.client?.name || '거래처'} 미팅${j.meetingPurpose ? ` · ${j.meetingPurpose}` : ''}`,
          date: j.meetingDate,
          clientName: j.client?.name || null,
          url: `/sales/${j.id}`,
        });
      }
      for (const t of j.todos) {
        if (inDateRange(t.dueDate, from, to)) {
          events.push({
            id: `todo-${t.id}`,
            type: 'todo',
            title: t.content,
            date: t.dueDate,
            done: t.isDone,
            clientName: j.client?.name || null,
            url: `/sales/${j.id}`,
          });
        }
      }
    }

    // 영업계획 (planDate)
    const plans = await prisma.salesPlan.findMany({
      where: inRange('planDate'),
      include: { client: { select: { id: true, name: true } } },
    });
    for (const pl of plans) {
      events.push({
        id: `plan-${pl.id}`,
        type: 'plan',
        title: pl.title,
        date: pl.planDate,
        clientName: pl.client?.name || null,
        url: `/sales/calendar`,
      });
    }

    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json({ events });
  } catch (error) {
    console.error('Calendar aggregate error:', error);
    res.status(500).json({ error: '일정 집계에 실패했습니다.' });
  }
});

function inDateRange(date, from, to) {
  const d = new Date(date);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ============================================================
// 영업 대시보드 — 단계별 파이프라인 금액·가중 예상매출·이번주 활동·정체 거래처
// ============================================================
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const clients = await prisma.salesClient.findMany({
      include: { journals: { select: { id: true, createdAt: true } } },
    });

    const stageMap = {};
    for (const s of SALES_STAGES) {
      stageMap[s.key] = { stage: s.key, label: s.label, count: 0, expected: 0, weighted: 0 };
    }
    let expectedTotal = 0;
    let weightedTotal = 0;
    const now = Date.now();
    const staleClients = [];
    for (const c of clients) {
      const key = SALES_STAGE_KEYS.includes(c.stage) ? c.stage : 'lead';
      const probPct = c.winProbability != null ? c.winProbability : (STAGE_DEFAULT_PROB[key] ?? 0);
      const exp = c.expectedRevenue || 0;
      const w = exp * (probPct / 100);
      stageMap[key].count += 1;
      stageMap[key].expected += exp;
      stageMap[key].weighted += w;
      expectedTotal += exp;
      weightedTotal += w;
      const lastJournal = c.journals.reduce((m, j) => Math.max(m, +new Date(j.createdAt)), 0);
      const last = lastJournal || +new Date(c.updatedAt);
      const days = Math.floor((now - last) / 86400000);
      if (days >= 14 && key !== 'expansion') {
        staleClients.push({ id: c.id, name: c.name, stage: key, days });
      }
    }
    staleClients.sort((a, b) => b.days - a.days);

    // 이번 주(월~일) 범위
    const weekFrom = new Date();
    weekFrom.setHours(0, 0, 0, 0);
    weekFrom.setDate(weekFrom.getDate() - ((weekFrom.getDay() + 6) % 7));
    const weekTo = new Date(weekFrom);
    weekTo.setDate(weekFrom.getDate() + 7);
    const in14 = new Date(+weekFrom + 14 * 86400000);

    const journals = await prisma.salesJournal.findMany({
      include: {
        client: { select: { id: true, name: true } },
        referrers: true,
        todos: true,
        author: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
    const viewable = journals.filter((j) => canViewJournal(req.user, j));

    let weekMeetings = 0;
    let openTodos = 0;
    const upcomingTodos = [];
    for (const j of viewable) {
      if (j.meetingDate) {
        const md = +new Date(j.meetingDate);
        if (md >= +weekFrom && md < +weekTo) weekMeetings += 1;
      }
      for (const t of j.todos) {
        if (t.isDone) continue;
        openTodos += 1;
        const due = +new Date(t.dueDate);
        if (due < +in14) {
          upcomingTodos.push({
            id: t.id, content: t.content, dueDate: t.dueDate,
            clientName: j.client?.name || null, journalId: j.id,
            overdue: due < +weekFrom,
          });
        }
      }
    }
    upcomingTodos.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));

    const recentJournals = viewable.slice(0, 8).map((j) => ({
      id: j.id, title: j.title, clientName: j.client?.name || null, stage: j.stage,
      authorName: j.author?.name || j.author?.email || null,
      createdAt: j.createdAt, meetingDate: j.meetingDate,
    }));

    res.json({
      stageSummary: SALES_STAGES.map((s) => stageMap[s.key]),
      totals: { clients: clients.length, expectedTotal, weightedTotal, openTodos },
      thisWeek: { meetings: weekMeetings, todosUpcoming: upcomingTodos.length },
      staleClients: staleClients.slice(0, 8),
      upcomingTodos: upcomingTodos.slice(0, 12),
      recentJournals,
      isSuperAdmin: isSuperAdmin(req.user),
    });
  } catch (error) {
    console.error('Sales dashboard error:', error);
    res.status(500).json({ error: '영업 대시보드 집계에 실패했습니다.' });
  }
});

module.exports = router;
