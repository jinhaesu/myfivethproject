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

// ── 영업 할일(향후 스케쥴) 마감 알림 ──────────────────────
// 미완료 할일이 D-1/D-DAY 이면 작성자·참고자에게 이메일. reminderSentAt로 중복 방지.
function kstDate(dateOnlyMs) {
  const d = new Date(dateOnlyMs);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

function buildTodoReminderHtml({ clientName, content, plan, dueLabel, dLabel, ctaUrl, journalTitle }) {
  return `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;color:#111">
    <div style="background:#5E6AD2;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
      <div style="font-size:13px;opacity:.85">영업 할일 마감 알림</div>
      <div style="font-size:19px;font-weight:800;margin-top:4px">${dLabel} · ${clientName}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:20px">
      <p style="font-size:15px;font-weight:700;margin:0 0 6px">${content}</p>
      ${plan ? `<p style="font-size:13px;color:#555;margin:0 0 10px">${plan}</p>` : ''}
      <table style="font-size:13px;color:#333;border-collapse:collapse;margin-top:8px">
        <tr><td style="color:#888;padding:2px 12px 2px 0">마감일</td><td style="font-weight:600">${dueLabel}</td></tr>
        ${journalTitle ? `<tr><td style="color:#888;padding:2px 12px 2px 0">영업일지</td><td>${journalTitle}</td></tr>` : ''}
      </table>
      <a href="${ctaUrl}" style="display:inline-block;margin-top:16px;background:#5E6AD2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">영업일지 열기 →</a>
    </div>
  </div>`;
}

async function checkSalesTodoReminders() {
  const now = kstParts();
  if (now.hour < 9) return;

  const soon = new Date(Date.now() + 3 * 86400000);
  const past = new Date(Date.now() - 2 * 86400000);
  const todos = await prisma.salesTodo.findMany({
    where: { isDone: false, reminderSentAt: null, dueDate: { gte: past, lte: soon } },
    include: {
      journal: {
        include: {
          author: { select: { email: true, name: true } },
          referrers: true,
          client: { select: { name: true } },
        },
      },
    },
  });

  const resend = getResend();
  for (const t of todos) {
    const left = kstParts(t.dueDate);
    const daysLeft = Math.round((left.dateOnly - now.dateOnly) / 86400000);
    if (daysLeft !== 0 && daysLeft !== 1) continue; // D-DAY / D-1 만

    const j = t.journal;
    if (!j) continue;
    const recipients = [
      ...new Set([j.author?.email, ...j.referrers.map((r) => r.email)].filter(Boolean)),
    ];
    if (recipients.length === 0) {
      await prisma.salesTodo.update({ where: { id: t.id }, data: { reminderSentAt: new Date() } });
      continue;
    }

    const dLabel = daysLeft === 0 ? 'D-DAY' : 'D-1';
    const clientName = j.client?.name || '거래처';
    const subject = `[영업 할일 ${dLabel}] ${clientName} — ${t.content}`;
    let sentAny = false;
    for (const r of recipients) {
      const ctaUrl = await createMagicLink(r, `/sales/${j.id}`);
      const html = buildTodoReminderHtml({
        clientName, content: t.content, plan: t.plan,
        dueLabel: kstDate(left.dateOnly), dLabel, ctaUrl, journalTitle: j.title,
      });
      if (!resend) {
        console.log(`[DEV] Sales todo ${dLabel} email to ${r}: ${subject}`);
        sentAny = true;
        continue;
      }
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'noreply@joinandjoin.com',
          to: r, subject, html,
        });
        sentAny = true;
      } catch (err) {
        console.error(`[Resend] 영업 할일(${dLabel}) 메일 실패 (${r}):`, err?.message || err);
      }
    }
    if (sentAny) {
      await prisma.salesTodo.update({ where: { id: t.id }, data: { reminderSentAt: new Date() } });
      console.log(`[SalesScheduler] 할일 ${dLabel} 알림 발송: ${clientName} — ${t.content} (${recipients.length}명)`);
    }
  }
}

function startLaunchScheduler() {
  const run = () => {
    checkLaunchSchedules().catch((err) =>
      console.error('[LaunchScheduler] 체크 실패:', err?.message || err)
    );
    checkSalesTodoReminders().catch((err) =>
      console.error('[SalesScheduler] 할일 알림 체크 실패:', err?.message || err)
    );
    cleanupExpiredMagicLinks().catch((err) =>
      console.error('[LaunchScheduler] 매직링크 정리 실패:', err?.message || err)
    );
  };
  setTimeout(run, 30 * 1000); // 부팅 30초 후 첫 체크 (마이그레이션 완료 대기)
  setInterval(run, CHECK_INTERVAL_MS);
  console.log('[LaunchScheduler] 출시 일정 알림 스케줄러 시작 (1시간 간격, D-30/14/7/3/1/0)');
}

module.exports = { startLaunchScheduler, checkLaunchSchedules, checkSalesTodoReminders };
