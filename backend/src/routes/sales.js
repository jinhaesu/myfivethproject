const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const storage = require('../lib/storage');
const { buildJournalDocx, journalFileName } = require('../lib/journalDoc');
const { logUpdate, logCreate, logDelete, logEvent } = require('../lib/changeLog');
const {
  SALES_STAGES,
  SALES_STAGE_KEYS,
  STAGE_DEFAULT_PROB,
  isSuperAdmin,
  canViewJournal,
  isJournalOwner,
  normalizeStage,
  normalizeDealStatus,
  DEAL_STATUSES,
  LOST_REASONS,
  MEETING_PURPOSES,
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

// 견적 라인아이템 정규화(제품명 있는 행만)
function buildQuoteData(quoteItems) {
  if (!Array.isArray(quoteItems)) return [];
  return quoteItems
    .map((q, i) => ({
      productName: String(q.productName || '').trim(),
      weightSpec: q.weightSpec || null,
      usp: q.usp || null,
      flavor: q.flavor || null,
      price: q.price || null,
      sortOrder: i,
    }))
    .filter((q) => q.productName);
}

// ── 영업일지 필수 항목 ───────────────────────────────────────
// 체크박스(최초미팅·샘플·견적)와 참고자, 열람 비밀번호(선택 기능)는 제외
const JOURNAL_REQUIRED = [
  ['title', '제목'],
  ['stage', '영업 단계'],
  ['meetingDate', '미팅 일자'],
  ['meetingPurpose', '미팅 목적'],
  ['meetingLocation', '장소'],
  ['attendees', '참석자 정보'],
  ['meetingSummary', '미팅 개요'],
  ['keyRequests', '핵심 요청사항'],
  ['productRequests', '제품의 구체적 요청 및 기획사항'],
];

const FIRST_MEETING_REQUIRED = [
  ['ownerOrg', '담당 조직'],
  ['buyerComposition', '바이어 구성'],
  ['annualRevenue', '바이어·거래처 연매출'],
  ['existingVendors', '기존 거래처'],
  ['managedItems', '관리 품목'],
  ['storageCondition', '보관 조건'],
  ['logisticsCondition', '물류 조건'],
];

const blank = (v) => v === undefined || v === null || !String(v).trim();

// 생성 시: 모든 필수 항목 확인. 수정 시(partial=true): 전달된 키만 확인.
function validateJournalBody(b, { partial = false } = {}) {
  const missing = [];
  for (const [key, label] of JOURNAL_REQUIRED) {
    if (partial && b[key] === undefined) continue;
    if (blank(b[key])) missing.push(label);
  }
  const todosGiven = !partial || b.todos !== undefined;
  if (todosGiven) {
    const valid = Array.isArray(b.todos)
      ? b.todos.filter((t) => t && t.dueDate && String(t.content || '').trim())
      : [];
    if (!valid.length) missing.push('향후 스케쥴 (일자 + 해야 할 일 1건 이상)');
  }
  if (b.hasQuote && (!Array.isArray(b.quoteItems) || !buildQuoteData(b.quoteItems).length)) {
    missing.push('견적 항목 (제품명 1건 이상)');
  }
  return missing;
}

// ============================================================
// 메타: 파이프라인 단계 목록
// ============================================================
router.get('/meta/stages', authenticate, (req, res) => {
  res.json({ stages: SALES_STAGES });
});

// 과거에 입력했던 장소 목록 (자동완성용) — 최근 사용 순
router.get('/meta/locations', authenticate, async (req, res) => {
  try {
    const [journals, plans] = await Promise.all([
      prisma.salesJournal.findMany({
        where: { meetingLocation: { not: null } },
        select: { meetingLocation: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      prisma.salesPlan.findMany({
        where: { location: { not: null } },
        select: { location: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    const merged = [
      ...journals.map((j) => ({ v: j.meetingLocation, at: j.createdAt })),
      ...plans.map((p) => ({ v: p.location, at: p.createdAt })),
    ]
      .filter((x) => x.v && String(x.v).trim())
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
    const seen = new Set();
    const locations = [];
    for (const m of merged) {
      const v = String(m.v).trim();
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      locations.push(v);
      if (locations.length >= 50) break;
    }
    res.json({ locations });
  } catch (error) {
    console.error('List locations error:', error);
    res.status(500).json({ error: '장소 목록 조회에 실패했습니다.' });
  }
});

// ============================================================
// 거래처 (Clients) — 팀 공유 마스터 데이터
// ============================================================
const CLIENT_INCLUDE = {
  createdBy: { select: USER_SELECT },
  contacts: { orderBy: { sortOrder: 'asc' } },
  _count: { select: { journals: true, plans: true } },
};

// 화면 드롭다운이 백엔드와 어긋나지 않도록 선택지를 한 곳에서 내려준다
router.get('/meta/options', authenticate, (req, res) => {
  res.json({ dealStatuses: DEAL_STATUSES, lostReasons: LOST_REASONS, meetingPurposes: MEETING_PURPOSES });
});

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
      expectedRevenue, winProbability, expectedCloseDate,
      contactName, contactPhone, contactEmail,
    } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '거래처명을 입력해주세요.' });
    }
    // 예상 계약일이 비면 매출 타임라인에서 그 딜이 통째로 사라진다 — 등록 시점에 받는다
    const closeDate = parseDate(expectedCloseDate);
    if (!closeDate) {
      return res.status(400).json({ error: '예상 계약일을 입력해주세요. 매출 타임라인 예측에 필요합니다.' });
    }
    // 등록 화면에서 함께 받은 실무 담당자를 첫 명함으로 만들어 둔다 (인수인계 시 연락처 유실 방지)
    const primaryContact = String(contactName || '').trim()
      ? {
          create: [{
            name: String(contactName).trim(),
            phone: String(contactPhone || '').trim() || null,
            email: String(contactEmail || '').trim() || null,
            sortOrder: 0,
          }],
        }
      : undefined;
    const client = await prisma.salesClient.create({
      data: {
        name: String(name).trim(),
        bizNumber: bizNumber || null,
        stage: normalizeStage(stage),
        expectedRevenue: parseRevenue(expectedRevenue),
        winProbability: parseProb(winProbability),
        expectedCloseDate: closeDate,
        ...(primaryContact ? { contacts: primaryContact } : {}),
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
    await logCreate(prisma, {
      entityType: 'client', entityId: client.id, actor: req.user,
      summary: `거래처 등록: ${client.name}`,
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
    if (b.expectedCloseDate !== undefined) data.expectedCloseDate = parseDate(b.expectedCloseDate);
    if (b.lostReason !== undefined) data.lostReason = b.lostReason || null;
    if (b.lostNote !== undefined) data.lostNote = b.lostNote || null;
    if (b.status !== undefined) {
      const next = normalizeDealStatus(b.status);
      data.status = next;
      // 실패 처리는 사유가 있어야 나중에 집계·회고가 가능하다
      if (next === 'lost') {
        const reason = b.lostReason !== undefined ? b.lostReason : existing.lostReason;
        if (!reason || !String(reason).trim()) {
          return res.status(400).json({ error: '실패 사유를 선택해주세요.' });
        }
      }
      // open으로 되돌리면 종료 기록을 지운다
      if (next === 'open') {
        data.closedAt = null;
        data.lostReason = null;
        data.lostNote = null;
      } else if (existing.status !== next) {
        data.closedAt = new Date();
      }
    }
    // 진행 중인 딜은 예상 계약일이 반드시 있어야 한다 (종료된 딜은 이미 결과가 나왔으므로 예외)
    const nextStatus = data.status !== undefined ? data.status : normalizeDealStatus(existing.status);
    const nextClose = data.expectedCloseDate !== undefined ? data.expectedCloseDate : existing.expectedCloseDate;
    if (nextStatus === 'open' && !nextClose) {
      return res.status(400).json({ error: '예상 계약일을 입력해주세요. 매출 타임라인 예측에 필요합니다.' });
    }
    const client = await prisma.salesClient.update({
      where: { id: req.params.id },
      data,
      include: CLIENT_INCLUDE,
    });
    await logUpdate(prisma, {
      entityType: 'client', entityId: client.id, actor: req.user, before: existing, after: data,
    });
    res.json({ client });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: '거래처 수정에 실패했습니다.' });
  }
});

router.delete('/clients/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.salesClient.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });
    await prisma.salesClient.delete({ where: { id: req.params.id } });
    await logDelete(prisma, {
      entityType: 'client', entityId: existing.id, actor: req.user,
      summary: `거래처 삭제: ${existing.name}`,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: '거래처 삭제에 실패했습니다.' });
  }
});

// ============================================================
// 거래처 담당자 명함 (Contacts)
// ============================================================
// 거래처 담당자(명함) 목록 — 일지 작성 시 '과거 명함 불러오기'용 경량 조회
router.get('/clients/:clientId/contacts', authenticate, async (req, res) => {
  try {
    const contacts = await prisma.salesContact.findMany({
      where: { clientId: req.params.clientId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ contacts });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: '담당자 목록 조회에 실패했습니다.' });
  }
});

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
  const { passwordHash, shareToken, ...rest } = j;
  return {
    ...rest,
    shareToken: owner ? shareToken : undefined,
    shared: !!shareToken,
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
      referrers, todos, sampleProvided, hasQuote, quoteItems,
    } = req.body;
    if (!clientId) return res.status(400).json({ error: '거래처를 지정해주세요.' });
    const client = await prisma.salesClient.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });

    const missing = validateJournalBody(req.body);
    if (missing.length) {
      return res.status(400).json({ error: `필수 항목을 입력해주세요: ${missing.join(', ')}` });
    }

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
    const quoteData = buildQuoteData(quoteItems);

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
        sampleProvided: !!sampleProvided,
        hasQuote: !!hasQuote || quoteData.length > 0,
        referrers: { create: referrerEmails.map((email) => ({ email })) },
        todos: { create: todoData },
        quoteItems: { create: quoteData },
      },
      include: { referrers: true, todos: true, quoteItems: { orderBy: { sortOrder: 'asc' } } },
    });
    // 작성 시 거래처 단계 동기화 (일지에 단계가 지정된 경우)
    if (stage) {
      await prisma.salesClient.update({ where: { id: clientId }, data: { stage: normalizeStage(stage) } });
    }
    await logCreate(prisma, {
      entityType: 'journal', entityId: journal.id, actor: req.user, summary: '영업일지 생성',
    });
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
        quoteItems: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!canViewJournal(req.user, journal)) {
      return res.status(403).json({ error: '이 영업일지를 열람할 권한이 없습니다.' });
    }
    const owner = isJournalOwner(req.user, journal);
    // 참고자이면서 비밀번호가 걸린 경우 뷰 토큰 필요
    if (!owner && journal.passwordHash && !hasJournalViewToken(req, journal)) {
      const { passwordHash, meetingSummary, keyRequests, productRequests, attendees, todos, attachments, quoteItems, ...safe } = journal;
      return res.status(403).json({
        error: '열람 비밀번호가 필요합니다.',
        passwordRequired: true,
        journal: { ...safe, passwordProtected: true, canEdit: false, locked: true },
      });
    }
    const { passwordHash, shareToken, ...rest } = journal;
    res.json({
      journal: {
        ...rest,
        shareToken: owner ? shareToken : undefined,
        shared: !!shareToken,
        passwordProtected: !!passwordHash,
        canEdit: owner,
        locked: false,
      },
    });
  } catch (error) {
    console.error('Get journal error:', error);
    res.status(500).json({ error: '영업일지 조회에 실패했습니다.' });
  }
});

// 수정 이력 — 상세 조회와 동일한 열람 권한(참고자·비밀번호 잠금) 적용
router.get('/journals/:id/history', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({
      where: { id: req.params.id },
      include: { referrers: true },
    });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!canViewJournal(req.user, journal)) {
      return res.status(403).json({ error: '이 영업일지를 열람할 권한이 없습니다.' });
    }
    if (!isJournalOwner(req.user, journal) && journal.passwordHash && !hasJournalViewToken(req, journal)) {
      return res.status(403).json({ error: '열람 비밀번호가 필요합니다.', passwordRequired: true });
    }
    const logs = await prisma.changeLog.findMany({
      where: { entityType: 'journal', entityId: journal.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(logs);
  } catch (error) {
    console.error('Journal history error:', error);
    res.status(500).json({ error: '수정 이력을 불러오지 못했습니다.' });
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
      // invalidPassword 플래그로 '세션 만료'가 아님을 프론트에 알린다
      // (없으면 공용 request()가 401을 로그아웃 신호로 오해해, 비밀번호를 한 번 틀리면 로그아웃된다)
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.', invalidPassword: true });
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
    // 수정 이력 diff의 기준이 되는 before 스냅샷 (하위 항목은 건수만)
    const journal = await prisma.salesJournal.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { todos: true, quoteItems: true, referrers: true } } },
    });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, journal)) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }
    const b = req.body;
    const missing = validateJournalBody(b, { partial: true });
    if (missing.length) {
      return res.status(400).json({ error: `필수 항목을 입력해주세요: ${missing.join(', ')}` });
    }
    const data = {};
    for (const f of ['title', 'meetingPurpose', 'meetingLocation', 'attendees', 'meetingSummary', 'keyRequests', 'productRequests', 'stage']) {
      if (b[f] !== undefined) data[f] = b[f] || null;
    }
    if (b.isFirstMeeting !== undefined) data.isFirstMeeting = !!b.isFirstMeeting;
    if (b.meetingDate !== undefined) data.meetingDate = parseDate(b.meetingDate);
    if (b.sampleProvided !== undefined) data.sampleProvided = !!b.sampleProvided;
    if (b.hasQuote !== undefined) data.hasQuote = !!b.hasQuote;
    // 비밀번호: 문자열이면 재설정, 빈문자열 명시면 해제, undefined면 유지
    if (b.password !== undefined) {
      data.passwordHash = b.password && String(b.password).trim() ? bcrypt.hashSync(String(b.password), 10) : null;
    }
    // referrers 교체
    const ops = [];
    // 하위 항목은 통째로 교체되므로 값 diff 대신 건수 변화만 이력에 남긴다
    const newCounts = {};
    if (Array.isArray(b.referrers)) {
      const emails = [...new Set(b.referrers.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
      newCounts.referrers = emails.length;
      ops.push(prisma.salesJournalReferrer.deleteMany({ where: { journalId: journal.id } }));
      if (emails.length) {
        ops.push(prisma.salesJournalReferrer.createMany({ data: emails.map((email) => ({ journalId: journal.id, email })) }));
      }
    }
    if (Array.isArray(b.todos)) {
      const todoData = b.todos
        .map((t) => ({ journalId: journal.id, dueDate: parseDate(t.dueDate), content: String(t.content || '').trim(), plan: t.plan || null, isDone: !!t.isDone }))
        .filter((t) => t.dueDate && t.content);
      newCounts.todos = todoData.length;
      ops.push(prisma.salesTodo.deleteMany({ where: { journalId: journal.id } }));
      if (todoData.length) ops.push(prisma.salesTodo.createMany({ data: todoData }));
    }
    if (Array.isArray(b.quoteItems)) {
      const quoteData = buildQuoteData(b.quoteItems).map((q) => ({ ...q, journalId: journal.id }));
      newCounts.quoteItems = quoteData.length;
      ops.push(prisma.salesQuoteItem.deleteMany({ where: { journalId: journal.id } }));
      if (quoteData.length) ops.push(prisma.salesQuoteItem.createMany({ data: quoteData }));
      // 견적 항목이 있으면 hasQuote 자동 true
      if (quoteData.length && b.hasQuote === undefined) data.hasQuote = true;
    }
    ops.push(prisma.salesJournal.update({ where: { id: journal.id }, data }));
    await prisma.$transaction(ops);
    if (b.stage) {
      await prisma.salesClient.update({ where: { id: journal.clientId }, data: { stage: normalizeStage(b.stage) } });
    }

    // ── 수정 이력 ──
    await logUpdate(prisma, {
      entityType: 'journal', entityId: journal.id, actor: req.user, before: journal, after: data,
    });
    // 열람 비밀번호는 해시를 남길 수 없으므로 설정/해제/변경 사실만 기록
    if (b.password !== undefined && data.passwordHash !== journal.passwordHash) {
      const summary = !journal.passwordHash
        ? '열람 비밀번호 설정'
        : !data.passwordHash
          ? '열람 비밀번호 해제'
          : '열람 비밀번호 변경';
      await logEvent(prisma, { entityType: 'journal', entityId: journal.id, action: 'update', summary, actor: req.user });
    }
    // 하위 항목 건수 변화
    for (const [key, label] of [['todos', '향후 스케쥴'], ['quoteItems', '견적 항목'], ['referrers', '참고자']]) {
      if (newCounts[key] === undefined) continue;
      const before = journal._count[key];
      if (before === newCounts[key]) continue;
      await logEvent(prisma, {
        entityType: 'journal', entityId: journal.id, action: 'update', actor: req.user,
        summary: `${label} ${before}건 → ${newCounts[key]}건`,
      });
    }
    const updated = await prisma.salesJournal.findUnique({
      where: { id: journal.id },
      include: { author: { select: USER_SELECT }, client: true, referrers: true, todos: { orderBy: { dueDate: 'asc' } }, attachments: { orderBy: { sortOrder: 'asc' } }, quoteItems: { orderBy: { sortOrder: 'asc' } } },
    });
    const { passwordHash, ...rest } = updated;
    res.json({ journal: { ...rest, shared: !!rest.shareToken, passwordProtected: !!passwordHash, canEdit: true, locked: false } });
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
    await logDelete(prisma, {
      entityType: 'journal', entityId: journal.id, actor: req.user,
      summary: `영업일지 삭제: ${journal.title || '(제목 없음)'}`,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete journal error:', error);
    res.status(500).json({ error: '영업일지 삭제에 실패했습니다.' });
  }
});

// ── 외부 공유 링크 · Word 다운로드 ───────────────────────────

// 상세/문서 생성에 필요한 전체 include
const JOURNAL_FULL_INCLUDE = {
  author: { select: USER_SELECT },
  client: true,
  referrers: true,
  todos: { orderBy: { dueDate: 'asc' } },
  attachments: { orderBy: { sortOrder: 'asc' } },
  quoteItems: { orderBy: { sortOrder: 'asc' } },
};

// 파일명: ASCII 폴백 + RFC 5987 UTF-8
function contentDisposition(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function sendJournalDocx(res, journal) {
  const buffer = await buildJournalDocx(journal);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', contentDisposition(journalFileName(journal)));
  res.send(buffer);
}

// 공유 링크 생성/재발급 — 작성자·최고관리자만
router.post('/journals/:id/share', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({ where: { id: req.params.id } });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, journal)) {
      return res.status(403).json({ error: '공유 링크를 만들 권한이 없습니다.' });
    }
    // 이미 있으면 그대로 재사용 (regenerate=true면 새로 발급)
    let token = journal.shareToken;
    if (!token || req.body?.regenerate) {
      token = crypto.randomBytes(24).toString('base64url');
      await prisma.salesJournal.update({
        where: { id: journal.id },
        data: { shareToken: token, sharedAt: new Date() },
      });
      // 토큰 값은 이력에 남기지 않는다 (링크를 아는 사람은 누구나 열람 가능하므로)
      await logEvent(prisma, {
        entityType: 'journal', entityId: journal.id, action: 'update', actor: req.user,
        summary: journal.shareToken ? '외부 공유 링크 재발급' : '외부 공유 링크 생성',
      });
    }
    res.json({ shareToken: token });
  } catch (error) {
    console.error('Create share link error:', error);
    res.status(500).json({ error: '공유 링크 생성에 실패했습니다.' });
  }
});

// 공유 해제
router.delete('/journals/:id/share', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({ where: { id: req.params.id } });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, journal)) {
      return res.status(403).json({ error: '공유를 해제할 권한이 없습니다.' });
    }
    await prisma.salesJournal.update({
      where: { id: journal.id },
      data: { shareToken: null, sharedAt: null },
    });
    if (journal.shareToken) {
      await logEvent(prisma, {
        entityType: 'journal', entityId: journal.id, action: 'update', actor: req.user,
        summary: '외부 공유 링크 해제',
      });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Revoke share link error:', error);
    res.status(500).json({ error: '공유 해제에 실패했습니다.' });
  }
});

// Word 다운로드 (사내 · 로그인 필요)
router.get('/journals/:id/word', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({
      where: { id: req.params.id },
      include: JOURNAL_FULL_INCLUDE,
    });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!canViewJournal(req.user, journal)) {
      return res.status(403).json({ error: '이 영업일지를 열람할 권한이 없습니다.' });
    }
    // 비밀번호 잠금은 뷰 토큰이 있어야 문서로 내려받을 수 있음
    if (!isJournalOwner(req.user, journal) && journal.passwordHash && !hasJournalViewToken(req, journal)) {
      return res.status(403).json({ error: '열람 비밀번호 확인이 필요합니다.', passwordRequired: true });
    }
    await sendJournalDocx(res, journal);
  } catch (error) {
    console.error('Journal word export error:', error);
    res.status(500).json({ error: 'Word 문서 생성에 실패했습니다.' });
  }
});

// 공개 조회 (로그인 불필요) — 공유 토큰으로만 접근. 참고자 이메일 등 내부 정보는 제외.
router.get('/public/journals/:token', async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({
      where: { shareToken: String(req.params.token) },
      include: JOURNAL_FULL_INCLUDE,
    });
    if (!journal) return res.status(404).json({ error: '공유가 해제되었거나 존재하지 않는 링크입니다.' });
    const { passwordHash, shareToken, referrers, author, ...rest } = journal;
    res.json({
      journal: {
        ...rest,
        // 외부 공유 문서에는 작성자 이름만 (이메일 비공개)
        authorName: author?.name || null,
        sharedAt: journal.sharedAt,
      },
    });
  } catch (error) {
    console.error('Public journal error:', error);
    res.status(500).json({ error: '공유 영업일지를 불러오지 못했습니다.' });
  }
});

// 공개 Word 다운로드
router.get('/public/journals/:token/word', async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({
      where: { shareToken: String(req.params.token) },
      include: JOURNAL_FULL_INCLUDE,
    });
    if (!journal) return res.status(404).json({ error: '공유가 해제되었거나 존재하지 않는 링크입니다.' });
    await sendJournalDocx(res, journal);
  } catch (error) {
    console.error('Public journal word error:', error);
    res.status(500).json({ error: 'Word 문서 생성에 실패했습니다.' });
  }
});

// 거래처에 등록된 명함을 일지 첨부로 불러오기 (파일 재업로드 없이 참조)
router.post('/journals/:id/attachments/from-contact', authenticate, async (req, res) => {
  try {
    const journal = await prisma.salesJournal.findUnique({ where: { id: req.params.id } });
    if (!journal) return res.status(404).json({ error: '영업일지를 찾을 수 없습니다.' });
    if (!isJournalOwner(req.user, journal)) {
      return res.status(403).json({ error: '첨부 권한이 없습니다.' });
    }
    const contact = await prisma.salesContact.findUnique({ where: { id: String(req.body.contactId || '') } });
    if (!contact) return res.status(404).json({ error: '담당자를 찾을 수 없습니다.' });
    if (!contact.cardImageUrl) {
      return res.status(400).json({ error: '이 담당자에게 등록된 명함 이미지가 없습니다.' });
    }
    const dup = await prisma.salesJournalAttachment.findFirst({
      where: { journalId: journal.id, sourceContactId: contact.id },
    });
    if (dup) return res.json({ attachment: dup, duplicated: true });

    const count = await prisma.salesJournalAttachment.count({ where: { journalId: journal.id } });
    const attachment = await prisma.salesJournalAttachment.create({
      data: {
        journalId: journal.id,
        kind: 'card',
        fileUrl: contact.cardImageUrl,
        fileName: contact.cardImageName || `${contact.name} 명함`,
        mimeType: null,
        sourceContactId: contact.id,
        sortOrder: count,
      },
    });
    res.json({ attachment });
  } catch (error) {
    console.error('Attach contact card error:', error);
    res.status(500).json({ error: '명함 불러오기에 실패했습니다.' });
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
    // 거래처 명함에서 불러온 첨부는 원본 파일을 공유하므로 파일은 지우지 않는다
    if (attachment.fileUrl && !attachment.sourceContactId) {
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
    const { clientId, title, planDate, content, stage, location } = req.body;
    const date = parseDate(planDate);
    // 필수: 제목·일정·영업 단계·거래처·내용·장소
    const missing = [];
    if (blank(title)) missing.push('제목');
    if (!date) missing.push('일정');
    if (blank(stage)) missing.push('영업 단계');
    if (blank(clientId)) missing.push('거래처');
    if (blank(content)) missing.push('내용');
    if (blank(location)) missing.push('장소(주소지)');
    if (missing.length) {
      return res.status(400).json({ error: `필수 항목을 입력해주세요: ${missing.join(', ')}` });
    }
    const plan = await prisma.salesPlan.create({
      data: {
        title: String(title).trim(),
        planDate: date,
        content: String(content).trim(),
        location: String(location).trim(),
        stage: normalizeStage(stage),
        clientId,
        authorId: req.user.id,
      },
      include: { author: { select: USER_SELECT }, client: { select: { id: true, name: true } } },
    });
    await logCreate(prisma, {
      entityType: 'plan', entityId: plan.id, actor: req.user,
      summary: `영업계획 등록: ${plan.title}`,
    });
    res.json({ plan });
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: '영업계획 등록에 실패했습니다.' });
  }
});

router.put('/plans/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.salesPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '영업계획을 찾을 수 없습니다.' });
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
    for (const [f, label] of [['content', '내용'], ['stage', '영업 단계'], ['clientId', '거래처'], ['location', '장소(주소지)']]) {
      if (b[f] === undefined) continue;
      if (blank(b[f])) return res.status(400).json({ error: `${label}은(는) 비울 수 없습니다.` });
      data[f] = f === 'stage' ? normalizeStage(b[f]) : String(b[f]).trim();
    }
    const plan = await prisma.salesPlan.update({
      where: { id: req.params.id },
      data,
      include: { author: { select: USER_SELECT }, client: { select: { id: true, name: true } } },
    });
    await logUpdate(prisma, {
      entityType: 'plan', entityId: plan.id, actor: req.user, before: existing, after: data,
    });
    res.json({ plan });
  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({ error: '영업계획 수정에 실패했습니다.' });
  }
});

router.delete('/plans/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.salesPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: '영업계획을 찾을 수 없습니다.' });
    await prisma.salesPlan.delete({ where: { id: req.params.id } });
    await logDelete(prisma, {
      entityType: 'plan', entityId: existing.id, actor: req.user,
      summary: `영업계획 삭제: ${existing.title}`,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: '영업계획 삭제에 실패했습니다.' });
  }
});

// ============================================================
// 매출채권 (Receivables) — 거래처별 월별 잔액
// ============================================================
router.get('/receivables', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const clients = await prisma.salesClient.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, stage: true },
    });
    const recs = await prisma.salesReceivable.findMany({ where: { year } });
    const byClient = {};
    for (const r of recs) {
      (byClient[r.clientId] = byClient[r.clientId] || {})[r.month] = r.amount;
    }
    const monthTotals = {};
    for (let m = 1; m <= 12; m++) monthTotals[m] = 0;
    let grandTotal = 0;
    const rows = clients.map((c) => {
      const months = {};
      let total = 0;
      for (let m = 1; m <= 12; m++) {
        const v = byClient[c.id]?.[m] || 0;
        months[m] = v;
        total += v;
        monthTotals[m] += v;
      }
      grandTotal += total;
      return { clientId: c.id, name: c.name, stage: c.stage, months, total };
    });
    res.json({ year, rows, monthTotals, grandTotal });
  } catch (error) {
    console.error('List receivables error:', error);
    res.status(500).json({ error: '매출채권 조회에 실패했습니다.' });
  }
});

// 단일 셀 upsert (거래처×연×월)
router.post('/receivables', authenticate, async (req, res) => {
  try {
    const { clientId, year, month } = req.body;
    const amount = parseRevenue(req.body.amount) || 0;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!clientId || !y || !(m >= 1 && m <= 12)) {
      return res.status(400).json({ error: '거래처·연·월 값이 올바르지 않습니다.' });
    }
    const rec = await prisma.salesReceivable.upsert({
      where: { clientId_year_month: { clientId, year: y, month: m } },
      update: { amount },
      create: { clientId, year: y, month: m, amount },
    });
    res.json({ receivable: rec });
  } catch (error) {
    console.error('Upsert receivable error:', error);
    res.status(500).json({ error: '매출채권 저장에 실패했습니다.' });
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
          location: j.meetingLocation || null, // 구글 캘린더/.ics 내보내기용
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
        location: pl.location || null, // 구글 캘린더/.ics 내보내기용
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

// ============================================================
// 파이프라인 분석 — 단계별 병목·실패 사유·예상 계약일 기준 매출 타임라인
// ============================================================
router.get('/pipeline/analytics', authenticate, async (req, res) => {
  try {
    const clients = await prisma.salesClient.findMany({
      include: { journals: { select: { createdAt: true, meetingDate: true, meetingPurpose: true } } },
    });
    const now = Date.now();
    const DAY = 86400000;

    // 1) 단계별 병목 — 건수·금액과 함께 '마지막 활동 이후 경과일' 중앙값을 본다.
    //    평균은 오래 방치된 1건에 끌려가므로 중앙값이 실제 체감에 가깝다.
    const median = (arr) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    const open = clients.filter((c) => (c.status || 'open') === 'open');
    const stageSummary = SALES_STAGES.map((s) => {
      const list = open.filter((c) => c.stage === s.key);
      const idleDays = list.map((c) => {
        const last = c.journals.reduce(
          (mx, j) => Math.max(mx, +new Date(j.meetingDate || j.createdAt)),
          +new Date(c.updatedAt),
        );
        return Math.floor((now - last) / DAY);
      });
      const expected = list.reduce((sum, c) => sum + (c.expectedRevenue || 0), 0);
      const weighted = list.reduce((sum, c) => {
        const prob = c.winProbability != null ? c.winProbability : (STAGE_DEFAULT_PROB[c.stage] ?? 0);
        return sum + (c.expectedRevenue || 0) * (prob / 100);
      }, 0);
      return {
        stage: s.key, label: s.label, count: list.length, expected, weighted,
        medianIdleDays: median(idleDays),
        stalled: list.filter((_, i) => idleDays[i] >= 30).length, // 30일 이상 무활동
      };
    });

    // 2) 승패 집계 — 왜 지는지 알아야 개선할 수 있다
    const won = clients.filter((c) => c.status === 'won');
    const lost = clients.filter((c) => c.status === 'lost');
    const decided = won.length + lost.length;
    const lostByReason = {};
    for (const c of lost) {
      const key = c.lostReason || '사유 미기재';
      lostByReason[key] = (lostByReason[key] || 0) + 1;
    }

    // 3) 예상 계약일 기준 월별 매출 타임라인 (향후 12개월)
    const timeline = [];
    const base = new Date();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      timeline.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        expected: 0, weighted: 0, count: 0,
      });
    }
    const idxOf = (date) => {
      const d = new Date(date);
      return (d.getFullYear() - base.getFullYear()) * 12 + (d.getMonth() - base.getMonth());
    };
    let undated = 0;
    for (const c of open) {
      if (!c.expectedCloseDate) { undated += 1; continue; }
      const i = idxOf(c.expectedCloseDate);
      if (i < 0 || i >= 12) continue; // 과거이거나 1년 밖이면 타임라인에서 제외
      const prob = c.winProbability != null ? c.winProbability : (STAGE_DEFAULT_PROB[c.stage] ?? 0);
      timeline[i].expected += c.expectedRevenue || 0;
      timeline[i].weighted += (c.expectedRevenue || 0) * (prob / 100);
      timeline[i].count += 1;
    }

    // 4) 미팅 목적별 분포 — 선택형 전환의 목적(활동 통계)
    const purposeCount = {};
    for (const c of clients) {
      for (const j of c.journals) {
        if (!j.meetingPurpose) continue;
        purposeCount[j.meetingPurpose] = (purposeCount[j.meetingPurpose] || 0) + 1;
      }
    }

    res.json({
      stageSummary,
      winLoss: {
        won: won.length,
        lost: lost.length,
        open: open.length,
        winRate: decided ? Math.round((won.length / decided) * 100) : null,
        lostByReason: Object.entries(lostByReason)
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
      },
      timeline,
      undatedOpenDeals: undated, // 예상 계약일이 없어 타임라인에 못 들어간 건수
      meetingPurposes: Object.entries(purposeCount)
        .map(([purpose, count]) => ({ purpose, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    console.error('파이프라인 분석 오류:', error);
    res.status(500).json({ error: '파이프라인 분석에 실패했습니다.' });
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
      // 이름·이메일을 따로 내려 화면에서 '이름 (이메일)'로 조합할 수 있게 한다
      authorName: j.author?.name || null,
      authorEmail: j.author?.email || null,
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
