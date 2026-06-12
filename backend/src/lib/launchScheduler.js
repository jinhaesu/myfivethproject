// 출시 일정(D-day) 알림 스케줄러
// 매시간 체크 — 출시 예정일 기준 D-30/14/7/3/1/0 에 단계 담당자·작성자에게 이메일 발송.
// LaunchNotificationLog(type=schedule_d{n})로 중복 발송 방지. KST 09시 이후에만 발송.
const { PrismaClient } = require('@prisma/client');
const { Resend } = require('resend');
const { buildScheduleEmailHtml } = require('./launchEmails');
const { createMagicLink, cleanupExpiredMagicLinks } = require('./magicLink');

const prisma = new PrismaClient();

const MILESTONES = [30, 14, 7, 3, 1, 0];
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1시간

let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function kstParts(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    dateOnly: Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()),
    hour: kst.getUTCHours(),
  };
}

const STATUS_LABEL = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};

async function checkLaunchSchedules() {
  const now = kstParts();
  if (now.hour < 9) return; // KST 09시 이전에는 발송하지 않음

  const projects = await prisma.launchProject.findMany({
    where: {
      targetLaunchDate: { not: null },
      status: { in: ['planning', 'in_progress'] },
    },
    include: {
      createdBy: { select: { email: true } },
      stages: { orderBy: { sortOrder: 'asc' }, include: { tasks: true } },
    },
  });

  for (const project of projects) {
    const launch = kstParts(project.targetLaunchDate);
    const daysLeft = Math.round((launch.dateOnly - now.dateOnly) / 86400000);
    if (!MILESTONES.includes(daysLeft)) continue;

    const type = `schedule_d${daysLeft}`;
    const already = await prisma.launchNotificationLog.findFirst({
      where: { projectId: project.id, type },
    });
    if (already) continue;

    const recipients = [
      ...new Set(
        [project.createdBy?.email, ...project.stages.map((s) => s.ownerEmail)].filter(Boolean)
      ),
    ];
    if (recipients.length === 0) continue;

    const stagesSummary = project.stages.map((s) => ({
      name: s.name,
      department: s.department,
      ownerName: s.ownerName,
      statusLabel: STATUS_LABEL[s.status] || s.status,
      completed: s.tasks.filter((t) => t.isCompleted).length,
      total: s.tasks.length,
    }));

    const dLabel = daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`;
    const subject = `[${project.productName}] 출시 ${dLabel} — 단계별 진행 점검`;

    const resend = getResend();
    const sent = [];
    // 수신자별 개인 매직 링크(1회용 자동 로그인)를 담아 개별 발송
    for (const recipient of recipients) {
      const ctaUrl = await createMagicLink(recipient, `/launches/${project.id}`);
      const html = buildScheduleEmailHtml(project, daysLeft, stagesSummary, { ctaUrl });
      if (!resend) {
        console.log(`[DEV] Launch schedule ${dLabel} email to ${recipient}: ${subject}`);
        sent.push(recipient);
        continue;
      }
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'noreply@joinandjoin.com',
          to: recipient,
          subject,
          html,
        });
        sent.push(recipient);
      } catch (err) {
        console.error(`[Resend] 출시 일정(${dLabel}) 메일 전송 실패 (${recipient}):`, err?.message || err);
      }
    }

    if (sent.length === 0) continue; // 전원 실패 → 로그 미기록, 다음 시간에 재시도

    await prisma.launchNotificationLog.create({
      data: { projectId: project.id, type, sentTo: sent.join(', ') },
    });
    console.log(`[LaunchScheduler] ${project.productName} ${dLabel} 알림 발송 (${sent.length}/${recipients.length}명)`);
  }
}

function startLaunchScheduler() {
  const run = () => {
    checkLaunchSchedules().catch((err) =>
      console.error('[LaunchScheduler] 체크 실패:', err?.message || err)
    );
    cleanupExpiredMagicLinks().catch((err) =>
      console.error('[LaunchScheduler] 매직링크 정리 실패:', err?.message || err)
    );
  };
  setTimeout(run, 30 * 1000); // 부팅 30초 후 첫 체크 (마이그레이션 완료 대기)
  setInterval(run, CHECK_INTERVAL_MS);
  console.log('[LaunchScheduler] 출시 일정 알림 스케줄러 시작 (1시간 간격, D-30/14/7/3/1/0)');
}

module.exports = { startLaunchScheduler, checkLaunchSchedules };
