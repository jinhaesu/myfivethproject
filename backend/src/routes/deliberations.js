// 고시형 원료 심의 취득 관리
// 난소화성말토덱스트린 등 고시형 기능성 원료의 표시·광고/영양기준 심의를
// 제품별로 제안일정·결과일정·상태로 관리하고, 부서간 확인을 남긴다.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { logCreate, logUpdate, logDelete, logEvent } = require('../lib/changeLog');

const router = express.Router();
const prisma = new PrismaClient();

// ── 선택지(프론트와 서버가 어긋나지 않게 서버에서 내려준다) ──
const CATEGORIES = [
  { key: 'nutrition', label: '영양기준' },
  { key: 'advertising', label: '광고' },
];
const AD_CHANNELS = [
  { key: 'detail_page', label: '상세페이지' },
  { key: 'homeshopping', label: '홈쇼핑' },
  { key: 'tv_cf', label: 'TV CF' },
  { key: 'sns', label: 'SNS·온라인' },
  { key: 'print', label: '지면·인쇄' },
  { key: 'etc', label: '기타' },
];
const STATUSES = [
  { key: 'planned', label: '제안예정' },
  { key: 'submitted', label: '제안완료' },
  { key: 'in_review', label: '심의중' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'on_hold', label: '보류' },
];
// 부서간 확인 기본 대상 — 생성 시 이 부서들이 미확인 상태로 seed된다.
const DEFAULT_DEPARTMENTS = ['개발', 'RA/인허가', '마케팅', '영업', '품질'];
// 자주 쓰는 고시형(개별인정형 포함) 원료 자동완성 후보
const COMMON_INGREDIENTS = [
  '난소화성말토덱스트린',
  '가르시니아캄보지아 추출물',
  '홍삼',
  '프로바이오틱스',
  '밀크씨슬 추출물(실리마린)',
  '루테인',
  'EPA 및 DHA 함유 유지',
  '비타민C',
  '식이섬유',
  '보이차추출물',
];

const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));
const STATUS_KEYS = new Set(STATUSES.map((s) => s.key));
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function s(v) {
  const t = (v ?? '').toString().trim();
  return t || null;
}

const includeFull = {
  confirmations: { orderBy: { sortOrder: 'asc' } },
  label: { select: { id: true, productName: true } },
};

// ── 메타(선택지 + 제품 자동완성) ──
router.get('/meta', authenticate, async (req, res) => {
  try {
    const labels = await prisma.label.findMany({
      select: { id: true, productName: true, productType: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json({
      categories: CATEGORIES,
      adChannels: AD_CHANNELS,
      statuses: STATUSES,
      departments: DEFAULT_DEPARTMENTS,
      commonIngredients: COMMON_INGREDIENTS,
      products: labels,
    });
  } catch (e) {
    console.error('[Deliberation] meta', e?.message);
    res.status(500).json({ error: '메타 정보를 불러오지 못했습니다.' });
  }
});

// ── 스케줄(제안일정·결과일정을 캘린더 이벤트로) ──
router.get('/schedule', authenticate, async (req, res) => {
  try {
    const fromD = parseDate(req.query.from);
    const toD = parseDate(req.query.to);
    const range = {};
    if (fromD) range.gte = fromD;
    if (toD) range.lte = toD;
    const hasRange = fromD || toD;

    const items = await prisma.deliberation.findMany({
      where: hasRange
        ? { OR: [{ proposalDate: range }, { resultDate: range }] }
        : {},
      include: { label: { select: { id: true, productName: true } } },
    });

    const inRange = (d) => (!fromD || d >= fromD) && (!toD || d <= toD);
    const base = (d) => ({
      deliberationId: d.id,
      productName: d.productName,
      ingredientName: d.ingredientName,
      category: d.category,
      adChannel: d.adChannel,
      status: d.status,
      title: d.title,
    });
    const events = [];
    for (const d of items) {
      if (d.proposalDate && inRange(d.proposalDate)) {
        events.push({ id: `prop-${d.id}`, kind: 'proposal', date: d.proposalDate, ...base(d) });
      }
      if (d.resultDate && inRange(d.resultDate)) {
        events.push({ id: `res-${d.id}`, kind: 'result', date: d.resultDate, ...base(d) });
      }
    }
    res.json({ events });
  } catch (e) {
    console.error('[Deliberation] schedule', e?.message);
    res.status(500).json({ error: '스케줄을 불러오지 못했습니다.' });
  }
});

// ── 목록 ──
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, category, labelId, q, from, to } = req.query;
    const fromD = parseDate(from);
    const toD = parseDate(to);
    const AND = [];
    if (status) AND.push({ status });
    if (category) AND.push({ category });
    if (labelId) AND.push({ labelId });
    if (q) {
      AND.push({
        OR: [
          { productName: { contains: q, mode: 'insensitive' } },
          { ingredientName: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (fromD || toD) {
      const range = {};
      if (fromD) range.gte = fromD;
      if (toD) range.lte = toD;
      AND.push({ OR: [{ proposalDate: range }, { resultDate: range }] });
    }
    const items = await prisma.deliberation.findMany({
      where: AND.length ? { AND } : {},
      include: includeFull,
      orderBy: [{ proposalDate: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ deliberations: items });
  } catch (e) {
    console.error('[Deliberation] list', e?.message);
    res.status(500).json({ error: '목록을 불러오지 못했습니다.' });
  }
});

// ── 생성 ──
router.post('/', authenticate, async (req, res) => {
  try {
    const b = req.body || {};
    const ingredientName = s(b.ingredientName);
    if (!ingredientName) return res.status(400).json({ error: '고시형 원료명을 입력해주세요.' });
    if (!CATEGORY_KEYS.has(b.category)) return res.status(400).json({ error: '심의 종류(영양기준/광고)를 선택해주세요.' });

    let productName = s(b.productName);
    let labelId = s(b.labelId);
    if (labelId) {
      const label = await prisma.label.findUnique({ where: { id: labelId }, select: { productName: true } });
      if (!label) return res.status(400).json({ error: '선택한 제품을 찾을 수 없습니다.' });
      if (!productName) productName = label.productName;
    }
    if (!productName) return res.status(400).json({ error: '대상 제품을 선택하거나 제품명을 입력해주세요.' });

    const depts = Array.isArray(b.departments) && b.departments.length
      ? b.departments.map((d) => String(d).trim()).filter(Boolean)
      : DEFAULT_DEPARTMENTS;

    const created = await prisma.deliberation.create({
      data: {
        labelId: labelId || null,
        productName,
        ingredientName,
        functionalClaim: s(b.functionalClaim),
        category: b.category,
        adChannel: b.category === 'advertising' ? s(b.adChannel) : null,
        reviewBody: s(b.reviewBody),
        title: s(b.title),
        proposalDate: parseDate(b.proposalDate),
        resultDate: parseDate(b.resultDate),
        status: STATUS_KEYS.has(b.status) ? b.status : 'planned',
        resultNote: s(b.resultNote),
        referenceUrl: s(b.referenceUrl),
        memo: s(b.memo),
        createdById: req.user.id,
        confirmations: {
          create: depts.map((d, i) => ({ department: d, sortOrder: i })),
        },
      },
      include: includeFull,
    });

    await logCreate(prisma, {
      entityType: 'deliberation',
      entityId: created.id,
      entityLabel: `${created.productName} · ${created.ingredientName}`,
      actor: req.user,
      summary: `원료 심의 등록: ${created.ingredientName} (${CATEGORY_LABEL[created.category] || created.category})`,
    });

    res.status(201).json({ deliberation: created });
  } catch (e) {
    console.error('[Deliberation] create', e?.message);
    res.status(500).json({ error: '등록에 실패했습니다.' });
  }
});

// ── 상세 ──
router.get('/:id', authenticate, async (req, res) => {
  try {
    const item = await prisma.deliberation.findUnique({
      where: { id: req.params.id },
      include: includeFull,
    });
    if (!item) return res.status(404).json({ error: '심의 건을 찾을 수 없습니다.' });
    res.json({ deliberation: item });
  } catch (e) {
    console.error('[Deliberation] get', e?.message);
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

// ── 수정 ──
const EDITABLE = ['productName', 'ingredientName', 'functionalClaim', 'category', 'adChannel', 'reviewBody', 'title', 'status', 'resultNote', 'referenceUrl', 'memo'];
router.put('/:id', authenticate, async (req, res) => {
  try {
    const before = await prisma.deliberation.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: '심의 건을 찾을 수 없습니다.' });
    const b = req.body || {};

    const data = {};
    for (const f of EDITABLE) {
      if (!(f in b)) continue;
      if (f === 'category' && !CATEGORY_KEYS.has(b.category)) continue;
      if (f === 'status' && !STATUS_KEYS.has(b.status)) continue;
      if (['productName', 'ingredientName'].includes(f)) {
        const v = s(b[f]);
        if (v) data[f] = v;
      } else {
        data[f] = s(b[f]);
      }
    }
    // 광고가 아니면 채널은 비운다
    const nextCategory = data.category || before.category;
    if (nextCategory !== 'advertising') data.adChannel = null;
    else if ('adChannel' in b) data.adChannel = s(b.adChannel);

    if ('proposalDate' in b) data.proposalDate = parseDate(b.proposalDate);
    if ('resultDate' in b) data.resultDate = parseDate(b.resultDate);
    if ('labelId' in b) {
      const labelId = s(b.labelId);
      if (labelId) {
        const label = await prisma.label.findUnique({ where: { id: labelId }, select: { productName: true } });
        if (!label) return res.status(400).json({ error: '선택한 제품을 찾을 수 없습니다.' });
        data.labelId = labelId;
        if (!('productName' in data)) data.productName = label.productName;
      } else {
        data.labelId = null;
      }
    }

    const updated = await prisma.deliberation.update({
      where: { id: req.params.id },
      data,
      include: includeFull,
    });

    await logUpdate(prisma, {
      entityType: 'deliberation',
      entityId: updated.id,
      entityLabel: `${updated.productName} · ${updated.ingredientName}`,
      actor: req.user,
      before,
      after: { ...data },
      fields: Object.keys(data),
    });

    res.json({ deliberation: updated });
  } catch (e) {
    console.error('[Deliberation] update', e?.message);
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

// ── 삭제 ──
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const before = await prisma.deliberation.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: '심의 건을 찾을 수 없습니다.' });
    await prisma.deliberation.delete({ where: { id: req.params.id } });
    await logDelete(prisma, {
      entityType: 'deliberation',
      entityId: before.id,
      entityLabel: `${before.productName} · ${before.ingredientName}`,
      actor: req.user,
      summary: `원료 심의 삭제: ${before.ingredientName}`,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Deliberation] delete', e?.message);
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

// ── 부서 확인 행 추가 ──
router.post('/:id/confirmations', authenticate, async (req, res) => {
  try {
    const department = s(req.body?.department);
    if (!department) return res.status(400).json({ error: '부서명을 입력해주세요.' });
    const parent = await prisma.deliberation.findUnique({
      where: { id: req.params.id },
      include: { confirmations: true },
    });
    if (!parent) return res.status(404).json({ error: '심의 건을 찾을 수 없습니다.' });
    const nextSort = parent.confirmations.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
    const conf = await prisma.deliberationConfirmation.create({
      data: { deliberationId: parent.id, department, sortOrder: nextSort },
    });
    res.status(201).json({ confirmation: conf });
  } catch (e) {
    console.error('[Deliberation] add confirmation', e?.message);
    res.status(500).json({ error: '부서 추가에 실패했습니다.' });
  }
});

// ── 부서 확인 토글/메모 ──
router.put('/confirmations/:cid', authenticate, async (req, res) => {
  try {
    const conf = await prisma.deliberationConfirmation.findUnique({
      where: { id: req.params.cid },
      include: { deliberation: { select: { id: true, productName: true, ingredientName: true } } },
    });
    if (!conf) return res.status(404).json({ error: '확인 항목을 찾을 수 없습니다.' });
    const b = req.body || {};
    const data = {};
    if (typeof b.confirmed === 'boolean') {
      data.confirmed = b.confirmed;
      if (b.confirmed) {
        data.confirmedBy = s(b.confirmedBy) || req.user.name || req.user.email;
        data.confirmedAt = new Date();
      } else {
        data.confirmedBy = null;
        data.confirmedAt = null;
      }
    }
    if ('note' in b) data.note = s(b.note);
    const updated = await prisma.deliberationConfirmation.update({
      where: { id: req.params.cid },
      data,
    });
    if (typeof b.confirmed === 'boolean') {
      await logEvent(prisma, {
        entityType: 'deliberation',
        entityId: conf.deliberation.id,
        entityLabel: `${conf.deliberation.productName} · ${conf.deliberation.ingredientName}`,
        action: 'update',
        summary: `[${updated.department}] ${b.confirmed ? '확인 완료' : '확인 해제'}${data.confirmedBy ? ` · ${data.confirmedBy}` : ''}`,
        actor: req.user,
      });
    }
    res.json({ confirmation: updated });
  } catch (e) {
    console.error('[Deliberation] update confirmation', e?.message);
    res.status(500).json({ error: '부서 확인 갱신에 실패했습니다.' });
  }
});

// ── 부서 확인 행 삭제 ──
router.delete('/confirmations/:cid', authenticate, async (req, res) => {
  try {
    await prisma.deliberationConfirmation.delete({ where: { id: req.params.cid } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Deliberation] delete confirmation', e?.message);
    res.status(500).json({ error: '부서 삭제에 실패했습니다.' });
  }
});

module.exports = router;
