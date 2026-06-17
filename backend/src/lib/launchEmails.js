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

// 출시 전략 요약 (브랜드 유형 · 보관조건 · USP · 타겟 소비기한 · 영업채널)
function strategyPairs(project) {
  const uspList = Array.isArray(project.usp) ? project.usp.join(', ') : null;
  return [
    ['브랜드 유형', project.brandType],
    ['영업채널', project.salesChannels],
    ['중량/규격', project.weightSpec],
    ['보관 조건', project.storageCondition],
    ['USP', uspList],
    ['타겟 소비기한', project.targetShelfLife],
  ].filter(([, v]) => v);
}

function strategyLine(project) {
  const pairs = strategyPairs(project);
  if (pairs.length === 0) return '';
  const text = pairs.map(([k, v]) => `${k}: ${v}`).join(' · ');
  return `
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:10px 14px;margin:14px 0;">
      <p style="margin:0;font-size:12.5px;color:#5b21b6;line-height:1.7;">${text}</p>
    </div>`;
}

// 프론트엔드 기본 URL (FRONTEND_URL이 쉼표 구분 복수일 수 있어 첫 항목 사용)
function frontendBase() {
  const raw = process.env.FRONTEND_URL || '';
  const first = raw.split(',')[0].trim().replace(/\/+$/, '');
  return first || 'https://myfivethproject.vercel.app';
}

// 확인하러 가기 CTA 버튼 — url은 매직 링크(1회용 자동 로그인) 또는 일반 경로 URL
function ctaButton(url, label = '확인하러 가기') {
  const isMagic = url.includes('/auth/magic?');
  return `
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${url}"
         style="display:inline-block;background:#5E6AD2;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 36px;border-radius:8px;">
        ${label} →
      </a>
      <p style="margin:10px 0 0;font-size:11.5px;color:#9ca3af;">
        ${isMagic
          ? '클릭하면 자동 로그인되어 해당 화면이 바로 열립니다. (링크는 1회용, 7일 유효)'
          : '로그인 후 해당 화면으로 자동 이동합니다.'}
      </p>
    </div>`;
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
function buildStageEmailHtml(project, stage, { type = 'stage_start', message, ctaUrl } = {}) {
  const launchStr = kstDateStr(project.targetLaunchDate);
  const dueStr = kstDateStr(stage.dueDate);
  const heading = type === 'stage_start' ? '단계가 시작되었습니다' : '업무 리마인드';
  const isDisc = project.kind === 'discontinuation';
  const processLabel = isDisc ? '제품 단종 프로세스' : '신제품 출시 프로세스';
  const dateLabel = isDisc ? '단종 목표일' : '출시 예정일';
  const headerBg = isDisc ? '#475569' : '#7c3aed';
  const headerSub = isDisc ? '#cbd5e1' : '#ddd6fe';

  return `
    <div style="max-width:600px;margin:0 auto;font-family:${FONT};color:#1f2937;">
      <div style="background:${headerBg};padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:18px;">${project.productName}</h1>
        <p style="color:${headerSub};margin:8px 0 0;font-size:14px;">${processLabel} — ${heading}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:14px;line-height:1.6;">
          <strong>${stage.ownerName || stage.department}</strong>님, 담당하신
          <strong>「${stage.name}」</strong> (${stage.department}) 단계의 업무를 확인해주세요.
        </p>
        ${strategyLine(project)}
        ${launchStr ? `
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;font-size:13px;font-weight:bold;color:#92400e;">${dateLabel}: ${launchStr}</p>
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
        ${ctaButton(ctaUrl || `${frontendBase()}/launches/${project.id}#stage-${stage.sortOrder}`, '체크리스트 확인하러 가기')}
      </div>
      ${footer()}
    </div>`;
}

// 출시 일정(D-n) 알림 메일
function buildScheduleEmailHtml(project, daysLeft, stagesSummary, { ctaUrl } = {}) {
  const launchStr = kstDateStr(project.targetLaunchDate);
  const dLabel = daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`;
  const isDisc = project.kind === 'discontinuation';
  const dateLabel = isDisc ? '단종 목표일' : '출시 예정일';
  const goalLine = isDisc
    ? (daysLeft === 0 ? '오늘이 단종 목표일' : `단종 목표일까지 ${daysLeft}일`)
    : (daysLeft === 0 ? '오늘이 출시일' : `출시까지 ${daysLeft}일 남았습니다`);
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
        <p style="color:#e0e7ff;margin:8px 0 0;font-size:14px;">${dateLabel}: ${launchStr}</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:14px;line-height:1.6;">
          <strong>${goalLine}</strong>.
          단계별 진행 상황을 확인하고 미완료 업무를 점검해주세요.
        </p>
        ${strategyLine(project)}
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
        ${ctaButton(ctaUrl || `${frontendBase()}/launches/${project.id}`, '진행 현황 확인하러 가기')}
      </div>
      ${footer()}
    </div>`;
}

// 샘플 요청 메일 (담당자에게 요청 상세 전달)
function buildSampleRequestEmailHtml(project, request, requesterName, { ctaUrl } = {}) {
  const dueStr = kstDateStr(request.dueDate);
  const launchStr = kstDateStr(project.targetLaunchDate);

  const detailRows = [
    ['납기 (요청 기한)', `<strong style="color:#92400e;">${dueStr}</strong>`],
    ['수량', request.quantity],
    ['중량 / 규격', request.weightSpec],
    ['스펙 상세', request.specDetails],
    ['제안 판매채널', request.salesChannel],
    // 중량/규격은 요청서 자체 항목으로 위에 표기되므로 전략 요약에서는 제외(중복 방지)
    ...strategyPairs(project).filter(([k]) => k !== '중량/규격'),
    ['출시 예정일', launchStr],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12.5px;color:#6b7280;background:#f9fafb;width:130px;white-space:nowrap;">${k}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">${v}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="max-width:600px;margin:0 auto;font-family:${FONT};color:#1f2937;">
      <div style="background:#0891b2;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:18px;">${project.productName}</h1>
        <p style="color:#cffafe;margin:8px 0 0;font-size:14px;">샘플 제작 요청</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:14px;line-height:1.6;">
          <strong>${request.recipientName || '담당자'}</strong>님,
          <strong>${requesterName}</strong>님이 영업 채널 제안용 샘플 제작을 요청하였습니다.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${detailRows}
        </table>
        ${request.message ? `
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px;margin:16px 0;">
          <p style="margin:0;font-size:13px;color:#0369a1;font-weight:bold;">요청 메시지:</p>
          <p style="margin:6px 0 0;font-size:13px;color:#0c4a6e;white-space:pre-wrap;">${request.message}</p>
        </div>` : ''}
        <p style="font-size:12.5px;color:#6b7280;line-height:1.6;">
          ※ 기획·컨셉 단계가 완료된 제품입니다. 샘플 제작 진행 상황은 시스템의 출시 프로젝트 상세 화면에서 업데이트해주세요.
        </p>
        ${ctaButton(ctaUrl || `${frontendBase()}/launches/${project.id}`, '샘플 요청 확인하러 가기')}
      </div>
      ${footer()}
    </div>`;
}

// 샘플 전달 완료 회신 메일 (요청자에게)
function buildSampleDeliveredEmailHtml(project, request, { ctaUrl } = {}) {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:${FONT};color:#1f2937;">
      <div style="background:#16a34a;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:18px;">${project.productName}</h1>
        <p style="color:#dcfce7;margin:8px 0 0;font-size:14px;">샘플 전달 완료</p>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:14px;line-height:1.6;">
          요청하신 샘플(납기 ${kstDateStr(request.dueDate)})이 <strong>전달 완료</strong> 처리되었습니다.
          ${request.salesChannel ? `제안 채널: <strong>${request.salesChannel}</strong>` : ''}
        </p>
        <p style="font-size:13px;color:#6b7280;line-height:1.6;">
          판매처 확정 시 시스템에서 표기사항(라벨) 검토 워크플로를 진행해주세요.
        </p>
        ${ctaButton(ctaUrl || `${frontendBase()}/launches/${project.id}`)}
      </div>
      ${footer()}
    </div>`;
}

module.exports = {
  buildStageEmailHtml,
  buildScheduleEmailHtml,
  buildSampleRequestEmailHtml,
  buildSampleDeliveredEmailHtml,
  ctaButton,
  kstDateStr,
};
