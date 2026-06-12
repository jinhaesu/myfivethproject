// 출시 프로세스 알림 이메일 HTML 템플릿
const FONT = "'Apple SD Gothic Neo','Malgun Gothic',sans-serif";

function kstDateStr(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Seoul',
  });
}

function footer() {
  return `
    <div style="background:#f9fafb;padding:16px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        본 이메일은 제품 출시 관리 및 표기사항 검수 시스템에서 자동 발송되었습니다.
      </p>
    </div>`;
}

function taskTable(tasks) {
  const rows = tasks
    .map(
      (t) => `
      <tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${t.isCompleted ? '✅' : '⬜'}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${t.name}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${t.checkPoint || ''}</td>
      </tr>`
    )
    .join('');
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">완료</th>
          <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">업무</th>
          <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">체크 사항</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// 단계 시작/리마인드 메일
function buildStageEmailHtml(project, stage, { type = 'stage_start', message } = {}) {
  const launchStr = kstDateStr(project.targetLaunchDate);
  const dueStr = kstDateStr(stage.dueDate);
  const heading = type === 'stage_start' ? '단계가 시작되었습니다' : '업무 리마인드';

  return `
    <div style="max-width:600px;margin:0 auto;font-family:${FONT};color:#1f2937;">
      <div style="background:#7c3aed;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:18px;">${project.productName}</h1>
        <p style="color:#ddd6fe;margin:8px 0 0;font-size:14px;">신제품 출시 프로세스 — ${heading}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:14px;line-height:1.6;">
          <strong>${stage.ownerName || stage.department}</strong>님, 담당하신
          <strong>「${stage.name}」</strong> (${stage.department}) 단계의 업무를 확인해주세요.
        </p>
        ${launchStr ? `
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;font-size:13px;font-weight:bold;color:#92400e;">출시 예정일: ${launchStr}</p>
          ${dueStr ? `<p style="margin:4px 0 0;font-size:13px;color:#92400e;">단계 마감일: ${dueStr}</p>` : ''}
        </div>` : (dueStr ? `
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;font-size:13px;font-weight:bold;color:#92400e;">단계 마감일: ${dueStr}</p>
        </div>` : '')}
        ${message ? `
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;font-size:13px;color:#0369a1;font-weight:bold;">전달 메시지:</p>
          <p style="margin:6px 0 0;font-size:13px;color:#0c4a6e;">${message}</p>
        </div>` : ''}
        <p style="font-size:14px;font-weight:bold;margin:20px 0 8px;">체크리스트 (${stage.tasks.filter((t) => t.isCompleted).length}/${stage.tasks.length} 완료):</p>
        ${taskTable(stage.tasks)}
      </div>
      ${footer()}
    </div>`;
}

// 출시 일정(D-n) 알림 메일
function buildScheduleEmailHtml(project, daysLeft, stagesSummary) {
  const launchStr = kstDateStr(project.targetLaunchDate);
  const dLabel = daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`;
  const stageRows = stagesSummary
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${s.name}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${s.department}${s.ownerName ? ` / ${s.ownerName}` : ''}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;">${s.statusLabel}</td>
        <td style="padding:6px 12px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">${s.completed}/${s.total}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="max-width:600px;margin:0 auto;font-family:${FONT};color:#1f2937;">
      <div style="background:${daysLeft <= 3 ? '#dc2626' : '#2563eb'};padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:18px;">${project.productName} — ${dLabel}</h1>
        <p style="color:#e0e7ff;margin:8px 0 0;font-size:14px;">출시 예정일: ${launchStr}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:14px;line-height:1.6;">
          출시까지 <strong>${daysLeft === 0 ? '오늘이 출시일' : `${daysLeft}일 남았습니다`}</strong>.
          단계별 진행 상황을 확인하고 미완료 업무를 점검해주세요.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">단계</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">담당</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6b7280;">상태</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;font-size:12px;color:#6b7280;">완료</th>
            </tr>
          </thead>
          <tbody>${stageRows}</tbody>
        </table>
      </div>
      ${footer()}
    </div>`;
}

module.exports = { buildStageEmailHtml, buildScheduleEmailHtml, kstDateStr };
