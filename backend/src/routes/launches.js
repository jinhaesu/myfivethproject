const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { Resend } = require('resend');
const { authenticate } = require('../middleware/auth');
const { LAUNCH_STAGE_TEMPLATE, getTemplate } = require('../lib/launchTemplate');
const {
  buildStageEmailHtml,
  buildScheduleEmailHtml,
  buildSampleRequestEmailHtml,
  buildSampleDeliveredEmailHtml,
  kstDateStr,
} = require('../lib/launchEmails');
const { createMagicLink } = require('../lib/magicLink');
const { logUpdate, logCreate, logDelete, logEvent } = require('../lib/changeLog');

const router = express.Router();
const prisma = new PrismaClient();

let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const EMAIL_FROM = () => process.env.EMAIL_FROM || 'noreply@joinandjoin.com';

// 변경 이력 엔티티 타입 — 같은 테이블이지만 출시/단종을 구분해 남긴다
const logEntity = (kind) => (kind === 'discontinuation' ? 'discontinuation' : 'launch');

// 응답에서 비밀번호 해시 제거 + editProtected 불린만 노출
function sanitizeProject(p) {
  if (!p) return p;
  const { editPasswordHash, ...rest } = p;
  return { ...rest, editProtected: !!editPasswordHash };
}

// 편집 허용 여부: 비번 미설정이면 항상 허용, 설정됐으면 유효한 X-Edit-Token 필요
function isEditAllowed(req, project) {
  if (!project || !project.editPasswordHash) return true;
  const token = req.headers['x-edit-token'];
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.scope === 'project-edit' && decoded.projectId === project.id;
  } catch {
    return false;
  }
}

function editLockedResponse(res) {
  return res.status(403).json({ error: '편집 비밀번호가 필요합니다. 잠금을 해제해주세요.', editLocked: true });
}

async function sendStageNotification(project, stage, { type = 'stage_start', message } = {}) {
  if (!stage.ownerEmail) return { delivered: false, reason: '담당자 이메일 미지정' };
  const resend = getResend();
  const procLabel = project.kind === 'discontinuation' ? '단종' : '출시';
  const subject =
    type === 'stage_start'
      ? `[${project.productName}] ${procLabel} 단계 시작: ${stage.name}`
      : `[${project.productName}] ${procLabel} 업무 리마인드: ${stage.name}`;
  const ctaUrl = await createMagicLink(stage.ownerEmail, `/launches/${project.id}#stage-${stage.sortOrder}`);
  const html = buildStageEmailHtml(project, stage, { type, message, ctaUrl });

  if (!resend) {
    console.log(`[DEV] Launch stage email to ${stage.ownerEmail}: ${subject}`);
  } else {
    try {
      await resend.emails.send({ from: EMAIL_FROM(), to: stage.ownerEmail, subject, html });
    } catch (err) {
      console.error('[Resend] 출시 단계 메일 전송 실패:', err?.message || err);
      return { delivered: false, reason: err?.message || String(err) };
    }
  }
  await prisma.launchNotificationLog.create({
    data: { projectId: project.id, type, stageId: stage.id, sentTo: stage.ownerEmail },
  });
  return { delivered: true };
}

const CLIENT_BRIEF = { select: { id: true, name: true, stage: true } };

const PROJECT_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, department: true } },
  client: CLIENT_BRIEF,
  targetClients: { include: { client: CLIENT_BRIEF } },
  stages: {
    orderBy: { sortOrder: 'asc' },
    include: { tasks: { orderBy: { sortOrder: 'asc' } } },
  },
  sampleRequests: {
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, department: true } },
      client: CLIENT_BRIEF,
    },
  },
};

// 출시 대상 구분 — 채널 전용은 편의점 계열처럼 여러 거래처를 한 묶음으로 겨냥하는 경우
const LAUNCH_SCOPES = [
  { key: 'brand', label: '브랜드 공식 출시' },
  { key: 'channel', label: '채널 전용' },
  { key: 'client', label: '거래처 전용' },
];
const LAUNCH_SCOPE_KEYS = LAUNCH_SCOPES.map((s) => s.key);
const normalizeLaunchScope = (v) => (LAUNCH_SCOPE_KEYS.includes(v) ? v : 'brand');

// 구분과 대상 거래처는 한 쌍이다. 대상이 비면 구분 자체가 무의미해지므로 저장 전에 막고,
// 반대로 브랜드 공식 출시에 거래처가 붙어 있으면 조용히 떼어낸다.
async function resolveScope(scopeRaw, clientIdRaw, clientIdsRaw) {
  const scope = normalizeLaunchScope(scopeRaw);
  if (scope === 'brand') return { scope, clientId: null, clientIds: [] };

  if (scope === 'client') {
    const clientId = clientIdRaw ? String(clientIdRaw) : '';
    if (!clientId) return { error: '거래처 전용 출시는 대상 거래처를 선택해야 합니다.' };
    const client = await prisma.salesClient.findUnique({ where: { id: clientId } });
    if (!client) return { error: '거래처를 찾을 수 없습니다.' };
    return { scope, clientId, clientIds: [] };
  }

  // channel
  const ids = [...new Set((Array.isArray(clientIdsRaw) ? clientIdsRaw : []).map(String).filter(Boolean))];
  if (ids.length === 0) {
    return { error: '채널 전용 출시는 대상 거래처를 1곳 이상 선택해야 합니다.' };
  }
  const found = await prisma.salesClient.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) {
    return { error: '대상 거래처 중 찾을 수 없는 곳이 있습니다.' };
  }
  return { scope, clientId: null, clientIds: ids };
}

// 프로젝트 목록 (kind 쿼리로 출시/단종 구분, 미지정 시 출시)
router.get('/', authenticate, async (req, res) => {
  try {
    const kind = req.query.kind === 'discontinuation' ? 'discontinuation' : 'launch';
    const projects = await prisma.launchProject.findMany({
      where: { kind },
      orderBy: { createdAt: 'desc' },
      include: PROJECT_INCLUDE,
    });
    res.json({ projects: projects.map(sanitizeProject) });
  } catch (error) {
    console.error('List launch projects error:', error);
    res.status(500).json({ error: '프로젝트 목록 조회에 실패했습니다.' });
  }
});

// 출시 프로젝트 생성 (제과/제빵 템플릿 기반 단계·체크리스트 자동 생성)
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      kind: kindRaw, productName, productType, weightSpec, description, targetLaunchDate, stageOwners,
      brandType, salesChannels, storageCondition, usp, targetShelfLife, discontinueReason,
      editPassword, launchScope, clientId, clientIds,
    } = req.body;
    if (!productName) {
      return res.status(400).json({ error: '제품명을 입력해주세요.' });
    }
    const scoped = await resolveScope(launchScope, clientId, clientIds);
    if (scoped.error) return res.status(400).json({ error: scoped.error });
    const kind = kindRaw === 'discontinuation' ? 'discontinuation' : 'launch';
    const template = getTemplate(kind);
    // 편집 비밀번호: 입력 시 해시 저장, 빈칸이면 잠금 없음(null)
    const editPasswordHash =
      editPassword && String(editPassword).trim()
        ? bcrypt.hashSync(String(editPassword), 10)
        : null;

    // stageOwners: [{ sortOrder, ownerName, ownerEmail, department, dueDate }]
    // 모든 단계에 담당자 이름·이메일·마감일 지정 필수
    const ownerMap = new Map((stageOwners || []).map((o) => [o.sortOrder, o]));
    const missing = [];
    template.forEach((stage, idx) => {
      const o = ownerMap.get(idx) || {};
      const lacks = [];
      if (!o.ownerName || !String(o.ownerName).trim()) lacks.push('담당자 이름');
      if (!o.ownerEmail || !String(o.ownerEmail).trim()) lacks.push('담당자 이메일');
      if (!o.dueDate) lacks.push('마감일');
      if (lacks.length > 0) missing.push(`${stage.name}: ${lacks.join('·')}`);
    });
    if (missing.length > 0) {
      return res.status(400).json({
        error: `모든 단계에 담당자 이름·이메일·마감일을 지정해야 합니다.\n${missing.join('\n')}`,
      });
    }

    const project = await prisma.launchProject.create({
      data: {
        kind,
        productName,
        productType: productType || null,
        weightSpec: weightSpec || null,
        description: description || null,
        targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : null,
        editPasswordHash,
        discontinueReason: kind === 'discontinuation' ? (discontinueReason || null) : null,
        brandType: kind === 'launch' ? (brandType || null) : null,
        launchScope: scoped.scope,
        clientId: scoped.clientId,
        targetClients: scoped.clientIds.length
          ? { create: scoped.clientIds.map((id) => ({ clientId: id })) }
          : undefined,
        salesChannels: kind === 'launch' ? (salesChannels || null) : null,
        storageCondition: kind === 'launch' ? (storageCondition || null) : null,
        usp: kind === 'launch' && Array.isArray(usp) && usp.length > 0 ? usp : undefined,
        targetShelfLife: kind === 'launch' ? (targetShelfLife || null) : null,
        createdById: req.user.id,
        stages: {
          create: template.map((stage, idx) => {
            const owner = ownerMap.get(idx) || {};
            return {
              name: stage.name,
              department: owner.department || stage.department,
              ownerName: owner.ownerName || null,
              ownerEmail: owner.ownerEmail || null,
              dueDate: owner.dueDate ? new Date(owner.dueDate) : null,
              sortOrder: idx,
              tasks: {
                create: stage.tasks.map((task, tIdx) => ({
                  name: task.name,
                  checkPoint: task.checkPoint,
                  sortOrder: tIdx,
                })),
              },
            };
          }),
        },
      },
      include: PROJECT_INCLUDE,
    });

    await logCreate(prisma, {
      entityType: logEntity(kind),
      entityId: project.id,
      actor: req.user,
      summary: kind === 'discontinuation' ? '단종 프로젝트 생성' : '출시 프로젝트 생성',
    });

    res.status(201).json({ project: sanitizeProject(project) });
  } catch (error) {
    console.error('Create launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 생성에 실패했습니다.' });
  }
});

// 출시 대상 구분 선택지 — 화면이 백엔드와 어긋나지 않도록 한 곳에서 내려준다
router.get('/meta/scopes', authenticate, (req, res) => {
  res.json({ launchScopes: LAUNCH_SCOPES });
});

// ============================================================
// 거래처 매핑 제안 — 프로젝트명에 이미 들어 있는 거래처 정보를 읽어 후보를 제시한다.
// 자동 적용은 하지 않는다. 제품명 문자열만 보고 확정하면 남의 PB를 자사 라인업으로,
// 또는 그 반대로 잘못 표기하게 되고 브랜드 귀속은 계약 사안이라 되돌리기 어렵다.
// ============================================================

// 거래처명에서 프로젝트명과 대조할 별칭을 뽑는다.
// "GS25_냉장" → GS25·GS, "SSG (이마트)" → SSG·이마트, "쿠팡 로켓프레시" → 쿠팡
const ALIAS_STOPWORDS = new Set(['온라인', '담당', '전용', '기타']);
function clientAliases(name) {
  const out = new Set();
  const base = String(name || '').trim();
  if (!base) return [];
  out.add(base);
  const head = base.split(/[_(]/)[0].trim();
  if (head) {
    out.add(head);
    const firstWord = head.split(/\s+/)[0];
    if (firstWord) out.add(firstWord);
    // 제품명에는 "GS편의점"처럼 숫자를 뗀 형태로 적히는 경우가 많다
    const deDigit = head.replace(/\d+/g, '').trim();
    if (deDigit) out.add(deDigit);
  }
  const paren = base.match(/\(([^)]+)\)/);
  if (paren) out.add(paren[1].trim());
  return [...out].filter((a) => a.length >= 2 && !ALIAS_STOPWORDS.has(a));
}

// 이름에 거래처가 안 잡혀도 "전용"·"PB"·"군납"이면 자사 라인업이 아닐 가능성이 높다
const EXCLUSIVE_HINT = /전용|군납|납품|PB/i;

function suggestClients(project, clients) {
  const pname = String(project.productName || '');
  let candidates = clients.filter((c) => clientAliases(c.name).some((a) => pname.includes(a)));
  let confident = candidates.length === 1 ? candidates[0] : null;

  // 같은 거래처가 보관 구분별로 쪼개져 있으면(코스트코_냉동 / 코스트코_상온) 제품 보관조건으로 좁힌다
  if (candidates.length > 1) {
    const sc = String(project.storageCondition || '');
    const tokens = sc.includes('냉동')
      ? ['냉동']
      : sc.includes('냉장')
      ? ['냉장']
      : sc.includes('실온') || sc.includes('상온')
      ? ['상온', '실온']
      : [];
    if (tokens.length) {
      const narrowed = candidates.filter((c) => tokens.some((t) => c.name.includes(t)));
      if (narrowed.length === 1) confident = narrowed[0];
      else if (narrowed.length > 1) candidates = narrowed;
    }
  }
  return { candidates, confident };
}

router.get('/meta/client-suggestions', authenticate, async (req, res) => {
  try {
    const kind = req.query.kind === 'discontinuation' ? 'discontinuation' : 'launch';
    const [projects, clients] = await Promise.all([
      // 이미 대상이 지정된 건(전용·채널)은 제외한다
      prisma.launchProject.findMany({
        where: { kind, clientId: null, targetClients: { none: {} } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, productName: true, storageCondition: true,
          brandType: true, launchScope: true, editPasswordHash: true,
        },
      }),
      prisma.salesClient.findMany({ select: { id: true, name: true } }),
    ]);

    const items = [];
    for (const p of projects) {
      const { candidates, confident } = suggestClients(p, clients);
      const looksExclusive = EXCLUSIVE_HINT.test(p.productName) || p.brandType === 'PB';
      if (candidates.length === 0 && !looksExclusive) continue;
      items.push({
        projectId: p.id,
        productName: p.productName,
        storageCondition: p.storageCondition,
        brandType: p.brandType,
        editProtected: !!p.editPasswordHash,
        looksExclusive,
        // 확정 후보가 있어도 적용은 사람이 누른다
        confidentClientId: confident ? confident.id : null,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
      });
    }
    res.json({ items });
  } catch (error) {
    console.error('Client suggestion error:', error);
    res.status(500).json({ error: '거래처 매핑 제안 조회에 실패했습니다.' });
  }
});

// 단계 템플릿 조회 (생성 화면 미리보기용, kind별 분기)
router.get('/meta/template', authenticate, (req, res) => {
  const kind = req.query.kind === 'discontinuation' ? 'discontinuation' : 'launch';
  res.json({ template: getTemplate(kind) });
});

// 출시 프로젝트 상세
router.get('/:id', authenticate, async (req, res) => {
  try {
    const project = await prisma.launchProject.findUnique({
      where: { id: req.params.id },
      include: {
        ...PROJECT_INCLUDE,
        notifications: { orderBy: { sentAt: 'desc' }, take: 30 },
      },
    });
    if (!project) {
      return res.status(404).json({ error: '출시 프로젝트를 찾을 수 없습니다.' });
    }
    res.json({ project: sanitizeProject(project) });
  } catch (error) {
    console.error('Get launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 조회에 실패했습니다.' });
  }
});

// 편집 비밀번호 검증 → 성공 시 단기 편집 토큰(6시간) 발급
router.post('/:id/verify-edit-password', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    const project = await prisma.launchProject.findUnique({ where: { id: req.params.id } });
    if (!project) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    if (!project.editPasswordHash) {
      return res.status(400).json({ error: '이 프로젝트에는 편집 비밀번호가 설정되어 있지 않습니다.' });
    }
    const ok = bcrypt.compareSync(String(password || ''), project.editPasswordHash);
    if (!ok) {
      // invalidPassword 플래그로 '세션 만료'가 아님을 프론트에 알린다
      // (없으면 공용 request()가 401을 로그아웃 신호로 오해해, 비밀번호를 한 번 틀리면 로그아웃된다)
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.', invalidPassword: true });
    }
    const editToken = jwt.sign(
      { scope: 'project-edit', projectId: project.id },
      process.env.JWT_SECRET,
      { expiresIn: '6h' }
    );
    res.json({ editToken });
  } catch (error) {
    console.error('Verify edit password error:', error);
    res.status(500).json({ error: '비밀번호 확인에 실패했습니다.' });
  }
});

// 출시 프로젝트 수정 (메타/상태/편집 비밀번호)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.launchProject.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }

    const {
      productName, productType, weightSpec, description, targetLaunchDate, status,
      brandType, salesChannels, storageCondition, usp, targetShelfLife, discontinueReason,
      editPassword, launchScope, clientId, clientIds,
    } = req.body;

    // 잠금은 '등록 정보' 변경에만 적용. 상태(보류/재개 등) 단독 변경은 운영이라 자유
    const metaTouched = [
      productName, productType, weightSpec, description, targetLaunchDate, discontinueReason,
      brandType, salesChannels, storageCondition, usp, targetShelfLife, editPassword,
      launchScope, clientId, clientIds,
    ].some((v) => v !== undefined);
    if (metaTouched && !isEditAllowed(req, existing)) return editLockedResponse(res);

    const data = {};
    // 편집 비밀번호 변경/해제 (잠금 해제 상태에서만 도달)
    if (editPassword !== undefined) {
      data.editPasswordHash =
        editPassword && String(editPassword).trim() ? bcrypt.hashSync(String(editPassword), 10) : null;
    }
    if (productName !== undefined) data.productName = productName;
    if (productType !== undefined) data.productType = productType;
    if (weightSpec !== undefined) data.weightSpec = weightSpec || null;
    if (description !== undefined) data.description = description;
    if (targetLaunchDate !== undefined) {
      data.targetLaunchDate = targetLaunchDate ? new Date(targetLaunchDate) : null;
    }
    if (status !== undefined) data.status = status;
    if (discontinueReason !== undefined) data.discontinueReason = discontinueReason || null;
    if (brandType !== undefined) data.brandType = brandType || null;
    if (salesChannels !== undefined) data.salesChannels = salesChannels || null;
    if (storageCondition !== undefined) data.storageCondition = storageCondition || null;
    if (usp !== undefined) data.usp = Array.isArray(usp) ? usp : [];
    if (targetShelfLife !== undefined) data.targetShelfLife = targetShelfLife || null;
    // 구분과 대상 거래처는 한 쌍이라 한쪽만 바뀌어도 둘을 함께 다시 판정한다
    let scoped = null;
    if (launchScope !== undefined || clientId !== undefined || clientIds !== undefined) {
      const currentTargets = await prisma.launchProjectClient.findMany({
        where: { projectId: existing.id },
        select: { clientId: true },
      });
      scoped = await resolveScope(
        launchScope !== undefined ? launchScope : existing.launchScope,
        clientId !== undefined ? clientId : existing.clientId,
        clientIds !== undefined ? clientIds : currentTargets.map((t) => t.clientId),
      );
      if (scoped.error) return res.status(400).json({ error: scoped.error });
      data.launchScope = scoped.scope;
      data.clientId = scoped.clientId;
    }

    // 대상 목록은 통째로 갈아끼운다 — 부분 갱신은 지운 거래처가 남는 사고를 낸다
    if (scoped) {
      await prisma.launchProjectClient.deleteMany({ where: { projectId: existing.id } });
      if (scoped.clientIds.length) {
        await prisma.launchProjectClient.createMany({
          data: scoped.clientIds.map((id) => ({ projectId: existing.id, clientId: id })),
          skipDuplicates: true,
        });
      }
    }

    const project = await prisma.launchProject.update({
      where: { id: req.params.id },
      data,
      include: PROJECT_INCLUDE,
    });

    await logUpdate(prisma, {
      entityType: logEntity(existing.kind),
      entityId: existing.id,
      actor: req.user,
      before: existing,
      after: data,
    });

    res.json({ project: sanitizeProject(project) });
  } catch (error) {
    console.error('Update launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 수정에 실패했습니다.' });
  }
});

// 출시 프로젝트 삭제
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.launchProject.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    if (!isEditAllowed(req, existing)) return editLockedResponse(res);

    await logDelete(prisma, {
      entityType: logEntity(existing.kind),
      entityId: existing.id,
      actor: req.user,
      summary: `삭제: ${existing.productName}`,
    });

    await prisma.launchProject.delete({ where: { id: req.params.id } });
    res.json({ message: '프로젝트가 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 삭제에 실패했습니다.' });
  }
});

// 단계 수정 (담당자/마감일/상태) — in_progress 전환 시 담당자 이메일 알림
router.put('/stages/:stageId', authenticate, async (req, res) => {
  try {
    const { ownerName, ownerEmail, department, dueDate, status } = req.body;
    const existing = await prisma.launchStage.findUnique({
      where: { id: req.params.stageId },
      include: { project: true },
    });
    if (!existing) {
      return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });
    }

    // 담당자 이름·이메일·마감일은 비울 수 없음 (필수 유지)
    if (ownerName !== undefined && !String(ownerName).trim()) {
      return res.status(400).json({ error: '담당자 이름은 비울 수 없습니다.' });
    }
    if (ownerEmail !== undefined && !String(ownerEmail).trim()) {
      return res.status(400).json({ error: '담당자 이메일은 비울 수 없습니다.' });
    }
    if (dueDate !== undefined && !dueDate) {
      return res.status(400).json({ error: '단계 마감일은 비울 수 없습니다.' });
    }

    const data = {};
    if (ownerName !== undefined) data.ownerName = ownerName;
    if (ownerEmail !== undefined) data.ownerEmail = ownerEmail;
    if (department !== undefined) data.department = department;
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);

    let startingNow = false;
    if (status !== undefined && status !== existing.status) {
      data.status = status;
      if (status === 'in_progress') {
        data.startedAt = existing.startedAt || new Date();
        startingNow = true;
      } else if (status === 'completed') {
        data.completedAt = new Date();
      } else if (status === 'pending') {
        data.startedAt = null;
        data.completedAt = null;
      }
    }

    const stage = await prisma.launchStage.update({
      where: { id: req.params.stageId },
      data,
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });

    // startedAt/completedAt은 상태 변경에 딸린 값이라 이력에서 제외
    await logUpdate(prisma, {
      entityType: 'launchStage',
      entityId: existing.id,
      entityLabel: existing.name,
      actor: req.user,
      before: existing,
      after: data,
      fields: ['name', 'department', 'ownerName', 'ownerEmail', 'status', 'dueDate'],
    });

    // 단계 시작 시 프로젝트도 진행 중으로
    if (startingNow && existing.project.status === 'planning') {
      await prisma.launchProject.update({
        where: { id: existing.projectId },
        data: { status: 'in_progress' },
      });
    }

    let notification = null;
    if (startingNow) {
      notification = await sendStageNotification(existing.project, stage, { type: 'stage_start' });
    }

    res.json({ stage, notification });
  } catch (error) {
    console.error('Update launch stage error:', error);
    res.status(500).json({ error: '단계 수정에 실패했습니다.' });
  }
});

// 체크리스트 항목 토글/메모 — 전 항목 완료 시 단계 완료 + 다음 단계 자동 시작·알림
router.put('/tasks/:taskId', authenticate, async (req, res) => {
  try {
    const { isCompleted, note, completedBy } = req.body;
    const existing = await prisma.launchTask.findUnique({
      where: { id: req.params.taskId },
      include: { stage: { include: { project: true } } },
    });
    if (!existing) {
      return res.status(404).json({ error: '체크리스트 항목을 찾을 수 없습니다.' });
    }

    const data = {};
    if (isCompleted !== undefined) {
      data.isCompleted = isCompleted;
      data.completedAt = isCompleted ? new Date() : null;
      data.completedBy = isCompleted ? (completedBy || req.user.name || req.user.email) : null;
    }
    if (note !== undefined) data.note = note;

    const task = await prisma.launchTask.update({ where: { id: req.params.taskId }, data });

    // completedAt/completedBy는 체크에 딸린 값이라 이력에서 제외 (담당자는 actor로 남음)
    await logUpdate(prisma, {
      entityType: 'launchTask',
      entityId: existing.id,
      entityLabel: existing.name,
      actor: req.user,
      before: existing,
      after: data,
      fields: ['isCompleted', 'note'],
    });

    let stageCompleted = false;
    let nextStageStarted = null;

    if (isCompleted !== undefined) {
      const siblings = await prisma.launchTask.findMany({ where: { stageId: existing.stageId } });
      const allDone = siblings.every((t) => (t.id === task.id ? task.isCompleted : t.isCompleted));

      if (allDone && existing.stage.status !== 'completed') {
        stageCompleted = true;
        await prisma.launchStage.update({
          where: { id: existing.stageId },
          data: { status: 'completed', completedAt: new Date() },
        });
        // 체크 완료로 자동 전환된 단계도 이력에 남긴다 (수동 변경과 구분되게 summary로 기록)
        await logEvent(prisma, {
          entityType: 'launchStage',
          entityId: existing.stageId,
          action: 'update',
          summary: `체크리스트 전량 완료로 '${existing.stage.name}' 단계 자동 완료`,
          actor: req.user,
        });

        // 다음 단계 자동 시작 + 담당자 알림
        const nextStage = await prisma.launchStage.findFirst({
          where: { projectId: existing.stage.projectId, sortOrder: { gt: existing.stage.sortOrder } },
          orderBy: { sortOrder: 'asc' },
          include: { tasks: { orderBy: { sortOrder: 'asc' } } },
        });

        if (nextStage) {
          if (nextStage.status === 'pending') {
            const started = await prisma.launchStage.update({
              where: { id: nextStage.id },
              data: { status: 'in_progress', startedAt: new Date() },
              include: { tasks: { orderBy: { sortOrder: 'asc' } } },
            });
            await logEvent(prisma, {
              entityType: 'launchStage',
              entityId: started.id,
              action: 'update',
              summary: `이전 단계 완료로 '${started.name}' 단계 자동 시작`,
              actor: req.user,
            });
            const notification = await sendStageNotification(existing.stage.project, started, {
              type: 'stage_start',
            });
            nextStageStarted = { stage: started, notification };
          }
        } else {
          // 마지막 단계 완료 → 프로젝트 완료
          await prisma.launchProject.update({
            where: { id: existing.stage.projectId },
            data: { status: 'completed' },
          });
          await logEvent(prisma, {
            entityType: existing.stage.project.kind === 'discontinuation' ? 'discontinuation' : 'launch',
            entityId: existing.stage.projectId,
            action: 'update',
            summary: '마지막 단계 완료로 프로젝트 자동 완료',
            actor: req.user,
          });
        }
      } else if (!allDone && existing.stage.status === 'completed') {
        // 완료된 단계에서 체크 해제 → 진행 중으로 되돌림
        await prisma.launchStage.update({
          where: { id: existing.stageId },
          data: { status: 'in_progress', completedAt: null },
        });
        await logEvent(prisma, {
          entityType: 'launchStage',
          entityId: existing.stageId,
          action: 'update',
          summary: `체크 해제로 '${existing.stage.name}' 단계 진행 중으로 되돌림`,
          actor: req.user,
        });
      }
    }

    res.json({ task, stageCompleted, nextStageStarted });
  } catch (error) {
    console.error('Update launch task error:', error);
    res.status(500).json({ error: '체크리스트 항목 수정에 실패했습니다.' });
  }
});

// 수동 리마인드 발송 (특정 단계 담당자에게)
router.post('/:id/notify', authenticate, async (req, res) => {
  try {
    const { stageId, message } = req.body;
    const project = await prisma.launchProject.findUnique({ where: { id: req.params.id } });
    if (!project) {
      return res.status(404).json({ error: '출시 프로젝트를 찾을 수 없습니다.' });
    }
    const stage = await prisma.launchStage.findUnique({
      where: { id: stageId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!stage || stage.projectId !== project.id) {
      return res.status(404).json({ error: '단계를 찾을 수 없습니다.' });
    }

    const result = await sendStageNotification(project, stage, { type: 'manual', message });
    if (!result.delivered) {
      return res.status(400).json({ error: `알림 발송 실패: ${result.reason}` });
    }
    res.json({ message: '리마인드 알림이 발송되었습니다.' });
  } catch (error) {
    console.error('Launch notify error:', error);
    res.status(500).json({ error: '알림 발송에 실패했습니다.' });
  }
});

// 샘플 요청 생성 — 기획·컨셉(1단계) 완료 후에만 가능, 담당자 이메일로 상세 발송
router.post('/:id/sample-requests', authenticate, async (req, res) => {
  try {
    const {
      recipientName, recipientEmail, dueDate, quantity, weightSpec,
      specDetails, salesChannel, message, clientId,
    } = req.body;

    if (!recipientEmail || !dueDate) {
      return res.status(400).json({ error: '담당자 이메일과 납기일을 입력해주세요.' });
    }

    const project = await prisma.launchProject.findUnique({
      where: { id: req.params.id },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!project) {
      return res.status(404).json({ error: '출시 프로젝트를 찾을 수 없습니다.' });
    }

    // 거래처 전용 제품의 샘플은 그 거래처 것이 확실하므로 굳이 다시 묻지 않는다
    let sampleClientId = clientId ? String(clientId) : (project.clientId || null);
    if (sampleClientId) {
      const exists = await prisma.salesClient.findUnique({ where: { id: sampleClientId } });
      if (!exists) return res.status(400).json({ error: '거래처를 찾을 수 없습니다.' });
    }

    // 게이트: 첫 단계(기획·컨셉)가 완료되어야 샘플 요청 가능
    const firstStage = project.stages[0];
    if (!firstStage || firstStage.status !== 'completed') {
      return res.status(400).json({
        error: `샘플 요청은 「${firstStage ? firstStage.name : '기획·컨셉'}」 단계의 체크리스트를 모두 완료한 후에 가능합니다.`,
      });
    }

    const request = await prisma.sampleRequest.create({
      data: {
        recipientName: recipientName || null,
        recipientEmail,
        dueDate: new Date(dueDate),
        quantity: quantity || null,
        weightSpec: weightSpec || null,
        specDetails: specDetails || null,
        salesChannel: salesChannel || null,
        clientId: sampleClientId,
        message: message || null,
        requestedById: req.user.id,
        projectId: project.id,
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true, department: true } },
        client: CLIENT_BRIEF,
      },
    });

    // 담당자 이메일 발송
    const requesterName = req.user.name || req.user.email;
    const subject = `[${project.productName}] 샘플 제작 요청 (납기 ${kstDateStr(request.dueDate)})`;
    const ctaUrl = await createMagicLink(recipientEmail, `/launches/${project.id}`);
    const html = buildSampleRequestEmailHtml(project, request, requesterName, { ctaUrl });

    let mailDelivered = false;
    const resend = getResend();
    if (!resend) {
      console.log(`[DEV] Sample request email to ${recipientEmail}: ${subject}`);
      mailDelivered = true;
    } else {
      try {
        await resend.emails.send({ from: EMAIL_FROM(), to: recipientEmail, subject, html });
        mailDelivered = true;
      } catch (err) {
        console.error('[Resend] 샘플 요청 메일 전송 실패:', err?.message || err);
      }
    }

    if (mailDelivered) {
      await prisma.launchNotificationLog.create({
        data: { projectId: project.id, type: 'sample_request', sentTo: recipientEmail },
      });
    }

    res.status(201).json({
      request,
      mailDelivered,
      message: mailDelivered
        ? '샘플 요청이 등록되고 담당자에게 이메일이 발송되었습니다.'
        : '샘플 요청은 등록되었으나 이메일 발송에 실패했습니다. 리마인드를 다시 시도해주세요.',
    });
  } catch (error) {
    console.error('Create sample request error:', error);
    res.status(500).json({ error: '샘플 요청 등록에 실패했습니다.' });
  }
});

// 샘플 요청 상태 변경 (requested → in_progress → delivered / canceled)
// delivered 처리 시 요청자에게 회신 메일
router.put('/sample-requests/:requestId', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['requested', 'in_progress', 'delivered', 'canceled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
    }

    const existing = await prisma.sampleRequest.findUnique({
      where: { id: req.params.requestId },
      include: {
        project: true,
        requestedBy: { select: { name: true, email: true } },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: '샘플 요청을 찾을 수 없습니다.' });
    }

    const request = await prisma.sampleRequest.update({
      where: { id: req.params.requestId },
      data: { status },
      include: { requestedBy: { select: { id: true, name: true, email: true, department: true } } },
    });

    // 전달 완료 → 요청자에게 회신
    if (status === 'delivered' && existing.requestedBy?.email) {
      const resend = getResend();
      const subject = `[${existing.project.productName}] 샘플 전달 완료`;
      const ctaUrl = await createMagicLink(existing.requestedBy.email, `/launches/${existing.projectId}`);
      const html = buildSampleDeliveredEmailHtml(existing.project, existing, { ctaUrl });
      if (!resend) {
        console.log(`[DEV] Sample delivered email to ${existing.requestedBy.email}: ${subject}`);
      } else {
        try {
          await resend.emails.send({
            from: EMAIL_FROM(),
            to: existing.requestedBy.email,
            subject,
            html,
          });
          await prisma.launchNotificationLog.create({
            data: { projectId: existing.projectId, type: 'sample_delivered', sentTo: existing.requestedBy.email },
          });
        } catch (err) {
          console.error('[Resend] 샘플 완료 회신 메일 전송 실패:', err?.message || err);
        }
      }
    }

    res.json({ request });
  } catch (error) {
    console.error('Update sample request error:', error);
    res.status(500).json({ error: '샘플 요청 상태 변경에 실패했습니다.' });
  }
});

module.exports = router;
