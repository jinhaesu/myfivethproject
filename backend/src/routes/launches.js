const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Resend } = require('resend');
const { authenticate } = require('../middleware/auth');
const { LAUNCH_STAGE_TEMPLATE } = require('../lib/launchTemplate');
const { buildStageEmailHtml, buildScheduleEmailHtml } = require('../lib/launchEmails');

const router = express.Router();
const prisma = new PrismaClient();

let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const EMAIL_FROM = () => process.env.EMAIL_FROM || 'noreply@joinandjoin.com';

async function sendStageNotification(project, stage, { type = 'stage_start', message } = {}) {
  if (!stage.ownerEmail) return { delivered: false, reason: '담당자 이메일 미지정' };
  const resend = getResend();
  const subject =
    type === 'stage_start'
      ? `[${project.productName}] 출시 단계 시작: ${stage.name}`
      : `[${project.productName}] 출시 업무 리마인드: ${stage.name}`;
  const html = buildStageEmailHtml(project, stage, { type, message });

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

const PROJECT_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, department: true } },
  stages: {
    orderBy: { sortOrder: 'asc' },
    include: { tasks: { orderBy: { sortOrder: 'asc' } } },
  },
};

// 출시 프로젝트 목록
router.get('/', authenticate, async (req, res) => {
  try {
    const projects = await prisma.launchProject.findMany({
      orderBy: { createdAt: 'desc' },
      include: PROJECT_INCLUDE,
    });
    res.json({ projects });
  } catch (error) {
    console.error('List launch projects error:', error);
    res.status(500).json({ error: '출시 프로젝트 목록 조회에 실패했습니다.' });
  }
});

// 출시 프로젝트 생성 (제과/제빵 템플릿 기반 단계·체크리스트 자동 생성)
router.post('/', authenticate, async (req, res) => {
  try {
    const { productName, productType, description, targetLaunchDate, stageOwners } = req.body;
    if (!productName) {
      return res.status(400).json({ error: '제품명을 입력해주세요.' });
    }

    // stageOwners: [{ sortOrder, ownerName, ownerEmail, dueDate }] (템플릿 단계 인덱스 기준, 선택)
    const ownerMap = new Map((stageOwners || []).map((o) => [o.sortOrder, o]));

    const project = await prisma.launchProject.create({
      data: {
        productName,
        productType: productType || null,
        description: description || null,
        targetLaunchDate: targetLaunchDate ? new Date(targetLaunchDate) : null,
        createdById: req.user.id,
        stages: {
          create: LAUNCH_STAGE_TEMPLATE.map((stage, idx) => {
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

    res.status(201).json({ project });
  } catch (error) {
    console.error('Create launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 생성에 실패했습니다.' });
  }
});

// 단계 템플릿 조회 (생성 화면 미리보기용)
router.get('/meta/template', authenticate, (req, res) => {
  res.json({ template: LAUNCH_STAGE_TEMPLATE });
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
    res.json({ project });
  } catch (error) {
    console.error('Get launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 조회에 실패했습니다.' });
  }
});

// 출시 프로젝트 수정 (메타/상태)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { productName, productType, description, targetLaunchDate, status } = req.body;
    const data = {};
    if (productName !== undefined) data.productName = productName;
    if (productType !== undefined) data.productType = productType;
    if (description !== undefined) data.description = description;
    if (targetLaunchDate !== undefined) {
      data.targetLaunchDate = targetLaunchDate ? new Date(targetLaunchDate) : null;
    }
    if (status !== undefined) data.status = status;

    const project = await prisma.launchProject.update({
      where: { id: req.params.id },
      data,
      include: PROJECT_INCLUDE,
    });
    res.json({ project });
  } catch (error) {
    console.error('Update launch project error:', error);
    res.status(500).json({ error: '출시 프로젝트 수정에 실패했습니다.' });
  }
});

// 출시 프로젝트 삭제
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await prisma.launchProject.delete({ where: { id: req.params.id } });
    res.json({ message: '출시 프로젝트가 삭제되었습니다.' });
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

    const data = {};
    if (ownerName !== undefined) data.ownerName = ownerName;
    if (ownerEmail !== undefined) data.ownerEmail = ownerEmail;
    if (department !== undefined) data.department = department;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

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
        }
      } else if (!allDone && existing.stage.status === 'completed') {
        // 완료된 단계에서 체크 해제 → 진행 중으로 되돌림
        await prisma.launchStage.update({
          where: { id: existing.stageId },
          data: { status: 'in_progress', completedAt: null },
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

module.exports = router;
