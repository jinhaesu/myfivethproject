// 변경 이력 조회 — 출시/단종/검수 등 별도 열람 제한이 없는 자료용.
// 영업일지는 열람 비밀번호가 걸릴 수 있어 sales.js의 /journals/:id/history에서 별도로 처리한다.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 이 라우트로 조회를 허용하는 엔티티 (임의 테이블 이력 열람 방지)
const ALLOWED = new Set(['launch', 'discontinuation', 'review', 'reviewItem', 'launchTask', 'launchStage', 'client', 'plan']);

router.get('/:entityType/:entityId', authenticate, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!ALLOWED.has(entityType)) {
      return res.status(400).json({ error: '지원하지 않는 이력 유형입니다.' });
    }
    const take = Math.min(Number(req.query.limit) || 200, 500);
    const logs = await prisma.changeLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json(logs);
  } catch (error) {
    console.error('변경 이력 조회 오류:', error);
    res.status(500).json({ error: '변경 이력을 불러오지 못했습니다.' });
  }
});

// 출시 프로젝트 전체 이력 — 프로젝트 본체 + 하위 단계/업무 이력을 한 번에
router.get('/project/:projectId/all', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await prisma.launchProject.findUnique({
      where: { id: projectId },
      select: { id: true, stages: { select: { id: true, tasks: { select: { id: true } } } } },
    });
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const stageIds = project.stages.map((s) => s.id);
    const taskIds = project.stages.flatMap((s) => s.tasks.map((t) => t.id));

    const logs = await prisma.changeLog.findMany({
      where: {
        OR: [
          { entityType: { in: ['launch', 'discontinuation'] }, entityId: projectId },
          { entityType: 'launchStage', entityId: { in: stageIds } },
          { entityType: 'launchTask', entityId: { in: taskIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json(logs);
  } catch (error) {
    console.error('프로젝트 이력 조회 오류:', error);
    res.status(500).json({ error: '변경 이력을 불러오지 못했습니다.' });
  }
});

// 라벨(제품) 단위 검수 이력 — 카테고리 하위 검수 항목 이력을 한 번에 모아 본다
router.get('/label/:labelId/review', authenticate, async (req, res) => {
  try {
    const categories = await prisma.reviewCategory.findMany({
      where: { labelId: req.params.labelId },
      select: { items: { select: { id: true } } },
    });
    const itemIds = categories.flatMap((c) => c.items.map((i) => i.id));
    if (!itemIds.length) return res.json([]);

    const logs = await prisma.changeLog.findMany({
      where: { entityType: 'review', entityId: { in: itemIds } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json(logs);
  } catch (error) {
    console.error('검수 이력 조회 오류:', error);
    res.status(500).json({ error: '변경 이력을 불러오지 못했습니다.' });
  }
});

// ============================================================
// 전사 최근 변경 활동 피드 (대시보드용)
// ============================================================

// 엔티티 유형별 표시 정보
const TYPE_META = {
  journal: { label: '영업일지', group: 'sales' },
  client: { label: '거래처', group: 'sales' },
  plan: { label: '영업계획', group: 'sales' },
  launch: { label: '출시', group: 'launch' },
  discontinuation: { label: '단종', group: 'launch' },
  launchStage: { label: '출시 단계', group: 'launch' },
  launchTask: { label: '체크리스트', group: 'launch' },
  review: { label: '표기사항 검수', group: 'review' },
};

// entityId 묶음을 실제 대상 이름·링크로 해석한다.
// 이미 삭제된 대상은 조회되지 않으므로 이력에 남은 summary로 대체 표시된다.
async function resolveTargets(logs) {
  const idsOf = (type) => [...new Set(logs.filter((l) => l.entityType === type).map((l) => l.entityId))];
  const target = {}; // `${entityType}:${entityId}` → { name, url }
  const put = (type, id, name, url) => {
    target[`${type}:${id}`] = { name, url };
  };

  const [journals, clients, plans, projects, stages, tasks, items] = await Promise.all([
    idsOf('journal').length
      ? prisma.salesJournal.findMany({
          where: { id: { in: idsOf('journal') } },
          select: { id: true, title: true, client: { select: { name: true } } },
        })
      : [],
    idsOf('client').length
      ? prisma.salesClient.findMany({ where: { id: { in: idsOf('client') } }, select: { id: true, name: true } })
      : [],
    idsOf('plan').length
      ? prisma.salesPlan.findMany({ where: { id: { in: idsOf('plan') } }, select: { id: true, title: true } })
      : [],
    idsOf('launch').concat(idsOf('discontinuation')).length
      ? prisma.launchProject.findMany({
          where: { id: { in: idsOf('launch').concat(idsOf('discontinuation')) } },
          select: { id: true, productName: true },
        })
      : [],
    idsOf('launchStage').length
      ? prisma.launchStage.findMany({
          where: { id: { in: idsOf('launchStage') } },
          select: { id: true, name: true, projectId: true, project: { select: { productName: true } } },
        })
      : [],
    idsOf('launchTask').length
      ? prisma.launchTask.findMany({
          where: { id: { in: idsOf('launchTask') } },
          select: { id: true, name: true, stage: { select: { projectId: true, project: { select: { productName: true } } } } },
        })
      : [],
    idsOf('review').length
      ? prisma.reviewItem.findMany({
          where: { id: { in: idsOf('review') } },
          select: { id: true, taskName: true, category: { select: { labelId: true, label: { select: { productName: true } } } } },
        })
      : [],
  ]);

  journals.forEach((j) => put('journal', j.id, j.title || `${j.client?.name || '거래처'} 영업일지`, `/sales/${j.id}`));
  clients.forEach((c) => put('client', c.id, c.name, `/sales/clients/${c.id}`));
  plans.forEach((p) => put('plan', p.id, p.title, '/sales/calendar'));
  projects.forEach((p) => {
    put('launch', p.id, p.productName, `/launches/${p.id}`);
    put('discontinuation', p.id, p.productName, `/launches/${p.id}`);
  });
  stages.forEach((s) => put('launchStage', s.id, `${s.project?.productName || ''} · ${s.name}`.trim(), `/launches/${s.projectId}`));
  tasks.forEach((t) =>
    put('launchTask', t.id, `${t.stage?.project?.productName || ''} · ${t.name}`.trim(), `/launches/${t.stage?.projectId || ''}`),
  );
  items.forEach((i) =>
    put('review', i.id, `${i.category?.label?.productName || ''} · ${i.taskName}`.trim(), `/labels/${i.category?.labelId || ''}`),
  );

  return target;
}

router.get('/recent', authenticate, async (req, res) => {
  try {
    const take = Math.min(Number(req.query.limit) || 60, 200);
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where = { createdAt: { gte: since } };
    if (req.query.group) {
      const types = Object.entries(TYPE_META)
        .filter(([, m]) => m.group === req.query.group)
        .map(([t]) => t);
      where.entityType = { in: types };
    }

    // 열람 제한이 있는 영업일지는 피드에서 내용을 노출하지 않기 위해 대상 id를 미리 확보
    const lockedJournalIds = new Set(
      (await prisma.salesJournal.findMany({ where: { passwordHash: { not: null } }, select: { id: true } })).map((j) => j.id),
    );

    const logs = await prisma.changeLog.findMany({ where, orderBy: { createdAt: 'desc' }, take });
    const target = await resolveTargets(logs);

    const feed = logs.map((l) => {
      const meta = TYPE_META[l.entityType] || { label: l.entityType, group: 'etc' };
      const t = target[`${l.entityType}:${l.entityId}`];
      // 비밀번호가 걸린 영업일지는 바뀐 값을 가리고 '수정됨' 사실만 노출한다
      const masked = l.entityType === 'journal' && lockedJournalIds.has(l.entityId);
      return {
        id: l.id,
        entityType: l.entityType,
        entityId: l.entityId,
        typeLabel: meta.label,
        group: meta.group,
        targetName: t?.name || null,
        url: t?.url || null,
        deleted: !t, // 대상이 삭제됐거나 조회 불가
        action: l.action,
        fieldLabel: l.fieldLabel,
        oldValue: masked ? null : l.oldValue,
        newValue: masked ? null : l.newValue,
        summary: masked ? null : l.summary,
        masked,
        actorName: l.actorName,
        actorEmail: l.actorEmail,
        createdAt: l.createdAt,
      };
    });

    res.json({ feed, days });
  } catch (error) {
    console.error('최근 활동 조회 오류:', error);
    res.status(500).json({ error: '최근 활동을 불러오지 못했습니다.' });
  }
});

module.exports = router;
