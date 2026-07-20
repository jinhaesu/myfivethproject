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

module.exports = router;
