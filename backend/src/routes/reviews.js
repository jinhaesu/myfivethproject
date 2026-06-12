const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Resend } = require('resend');
const { authenticate } = require('../middleware/auth');
const { ctaButton } = require('../lib/launchEmails');
const { createMagicLink } = require('../lib/magicLink');

const router = express.Router();
const prisma = new PrismaClient();

let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// 리뷰 항목 업데이트 (체크/해제, 검토자 이름, 비고)
router.put('/items/:itemId', authenticate, async (req, res) => {
  try {
    const { isCompleted, reviewerNote, reviewerName } = req.body;
    const { itemId } = req.params;

    const item = await prisma.reviewItem.findUnique({
      where: { id: itemId },
      include: { category: { include: { label: true } } },
    });

    if (!item) {
      return res.status(404).json({ error: '검토 항목을 찾을 수 없습니다.' });
    }

    // 변경된 필드만 업데이트 (기존 데이터 보존)
    const updateData = {};
    if (isCompleted !== undefined) {
      updateData.isCompleted = isCompleted;
      updateData.completedAt = isCompleted ? new Date() : null;
    }
    if (reviewerNote !== undefined) {
      updateData.reviewerNote = reviewerNote;
    }
    if (reviewerName !== undefined) {
      updateData.reviewerName = reviewerName;
    }

    const updated = await prisma.reviewItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        reviewer: { select: { id: true, name: true, department: true } },
      },
    });

    // 모든 리뷰가 완료되었는지 확인
    const allItems = await prisma.reviewItem.findMany({
      where: {
        category: { labelId: item.category.labelId },
      },
    });

    const allCompleted = allItems.every((i) => i.id === itemId ? isCompleted : i.isCompleted);

    if (allCompleted) {
      await prisma.label.update({
        where: { id: item.category.labelId },
        data: { status: 'approved' },
      });
    } else {
      const anyCompleted = allItems.some((i) => i.id === itemId ? isCompleted : i.isCompleted);
      if (anyCompleted) {
        await prisma.label.update({
          where: { id: item.category.labelId },
          data: { status: 'in_review' },
        });
      }
    }

    res.json({ item: updated });
  } catch (error) {
    console.error('Update review item error:', error);
    res.status(500).json({ error: '검토 항목 업데이트에 실패했습니다.' });
  }
});

// 라벨의 리뷰 진행률 조회
router.get('/progress/:labelId', authenticate, async (req, res) => {
  try {
    const categories = await prisma.reviewCategory.findMany({
      where: { labelId: req.params.labelId },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            reviewer: { select: { id: true, name: true, department: true } },
          },
        },
      },
    });

    const progress = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      total: cat.items.length,
      completed: cat.items.filter((i) => i.isCompleted).length,
      items: cat.items,
    }));

    const totalItems = progress.reduce((acc, cat) => acc + cat.total, 0);
    const completedItems = progress.reduce((acc, cat) => acc + cat.completed, 0);

    res.json({
      progress,
      summary: {
        total: totalItems,
        completed: completedItems,
        percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Get review progress error:', error);
    res.status(500).json({ error: '검토 진행률 조회에 실패했습니다.' });
  }
});

// 검토 요청 이메일 발송
router.post('/send-notification', authenticate, async (req, res) => {
  try {
    const { labelId, productName, email, deadline, message } = req.body;

    if (!email || !deadline || !productName) {
      return res.status(400).json({ error: '이메일, 마감일, 제품명을 입력해주세요.' });
    }

    // 현재 검토 진행률 조회
    const categories = await prisma.reviewCategory.findMany({
      where: { labelId },
      include: { items: true },
    });

    const totalItems = categories.reduce((acc, cat) => acc + cat.items.length, 0);
    const completedItems = categories.reduce(
      (acc, cat) => acc + cat.items.filter((i) => i.isCompleted).length,
      0
    );
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // 미완료 항목 목록
    const pendingItems = categories.flatMap((cat) =>
      cat.items
        .filter((i) => !i.isCompleted)
        .map((i) => ({ category: cat.name, task: i.taskName, department: i.department }))
    );

    const deadlineDate = new Date(deadline);
    const deadlineStr = deadlineDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

    const senderName = req.user.name || req.user.email;
    const emailFrom = process.env.EMAIL_FROM || 'noreply@joinandjoin.com';

    const subject = `[${productName}] 표기사항 검토 요청`;
    const ctaUrl = labelId ? await createMagicLink(email, `/labels/${labelId}`) : null;

    const pendingListHtml = pendingItems.length > 0
      ? pendingItems
          .map(
            (item) =>
              `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${item.category}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${item.task}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${item.department}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3" style="padding:12px;text-align:center;color:#6b7280;">모든 항목이 완료되었습니다.</td></tr>';

    const html = `
      <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1f2937;">
        <div style="background:#2563eb;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:18px;">${productName}</h1>
          <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">표기사항 검토 요청</p>
        </div>

        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
          <p style="font-size:14px;line-height:1.6;">안녕하세요,</p>
          <p style="font-size:14px;line-height:1.6;">
            <strong>${senderName}</strong>님이 <strong>&quot;${productName}&quot;</strong> 제품의 표기사항 검토를 요청하였습니다.
          </p>

          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0;font-size:14px;font-weight:bold;color:#92400e;">
              검토 마감일: ${deadlineStr}
            </p>
            <p style="margin:4px 0 0;font-size:13px;color:#92400e;">
              마감일까지 검토를 완료해주세요.
            </p>
          </div>

          ${message ? `
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0;font-size:13px;color:#0369a1;font-weight:bold;">추가 메시지:</p>
            <p style="margin:8px 0 0;font-size:13px;color:#0c4a6e;">${message}</p>
          </div>
          ` : ''}

          <div style="margin:20px 0;">
            <p style="font-size:14px;font-weight:bold;margin-bottom:8px;">
              현재 진행률: ${percentage}% (${completedItems}/${totalItems})
            </p>
            <div style="background:#e5e7eb;border-radius:8px;height:12px;overflow:hidden;">
              <div style="background:${percentage === 100 ? '#22c55e' : '#2563eb'};height:100%;width:${percentage}%;border-radius:8px;"></div>
            </div>
          </div>

          <p style="font-size:14px;font-weight:bold;margin:20px 0 8px;">미완료 검토 항목 (${pendingItems.length}건):</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">카테고리</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">검토 항목</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">담당 부서</th>
              </tr>
            </thead>
            <tbody>
              ${pendingListHtml}
            </tbody>
          </table>
          ${ctaUrl ? ctaButton(ctaUrl, '검토하러 가기') : ''}
        </div>

        <div style="background:#f9fafb;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            본 이메일은 영양성분 표기사항 관리 시스템에서 자동 발송되었습니다.
          </p>
        </div>
      </div>
    `;

    let mailDelivered = false;
    let mailError = null;
    const resend = getResend();
    if (resend) {
      try {
        await resend.emails.send({
          from: emailFrom,
          to: email,
          subject,
          html,
        });
        mailDelivered = true;
      } catch (mailErr) {
        mailError = mailErr?.message || String(mailErr);
        console.error('[Resend] 검토 요청 메일 전송 실패:', mailError);
      }
    } else {
      console.log(`[DEV] Review notification email to ${email}:`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Deadline: ${deadlineStr}`);
      console.log(`  Pending items: ${pendingItems.length}`);
    }

    res.json({
      message: mailDelivered
        ? '검토 요청 이메일이 발송되었습니다.'
        : (process.env.RESEND_API_KEY
            ? `이메일 발송에 실패했습니다: ${mailError || '알 수 없는 오류'}`
            : '개발 모드: 이메일은 콘솔에만 출력되었습니다.'),
      delivered: mailDelivered,
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: '이메일 발송에 실패했습니다.' });
  }
});

module.exports = router;
