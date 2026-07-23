// 변경 이력 기록 헬퍼
// 어떤 라우트에서든 before/after 스냅샷만 넘기면 필드 단위 diff를 만들어 ChangeLog에 남긴다.
// 이력 기록 실패가 본 요청을 깨뜨리면 안 되므로 모든 기록 함수는 내부에서 예외를 삼킨다.

// 절대 이력에 남기면 안 되는 필드(비밀번호 해시·공유 토큰 등)
const SECRET_FIELDS = new Set([
  'passwordHash',
  'editPasswordHash',
  'shareToken',
  'password',
  'editPassword',
]);

// 값이 바뀌어도 사용자 입장에서 '수정'이 아닌 필드
const NOISE_FIELDS = new Set(['updatedAt', 'createdAt', 'id', 'sortOrder']);

const MAX_VALUE_LEN = 300;

// 엔티티별 필드 한글 라벨 — 화면에 "미팅 목적: A → B" 형태로 보여주기 위함
const FIELD_LABELS = {
  journal: {
    title: '제목',
    stage: '영업 단계',
    isFirstMeeting: '최초 미팅 여부',
    meetingDate: '미팅 일자',
    meetingPurpose: '미팅 목적',
    meetingLocation: '장소',
    attendees: '참석자',
    meetingSummary: '미팅 개요',
    keyRequests: '핵심 요청사항',
    productRequests: '제품 요청·기획사항',
    decisions: '결정 사항',
    risks: '리스크·장애 요인',
    nextContactDate: '다음 접촉 예정일',
    nextContactPlan: '다음 접촉까지의 계획',
    competitorNote: '경쟁사·시장 동향',
    sampleProvided: '샘플 제공',
    hasQuote: '견적 제출',
    clientId: '거래처',
  },
  client: {
    name: '거래처명',
    bizNumber: '사업자번호',
    stage: '영업 단계',
    expectedRevenue: '예상 매출',
    winProbability: '성사 확률',
    ownerOrg: '운영 주체',
    buyerComposition: '바이어 구성',
    annualRevenue: '연 매출',
    existingVendors: '기존 거래처',
    managedItems: '취급 품목',
    storageCondition: '보관 조건',
    logisticsCondition: '물류 조건',
    note: '비고',
  },
  plan: {
    title: '제목',
    planDate: '일정',
    content: '내용',
    location: '장소',
    stage: '영업 단계',
    clientId: '거래처',
  },
  launch: {
    productName: '제품명',
    productType: '제품 유형',
    weightSpec: '중량·규격',
    description: '설명',
    targetLaunchDate: '출시 예정일',
    status: '진행 상태',
    brandType: '브랜드 유형',
    salesChannels: '영업 채널',
    storageCondition: '보관 조건',
    usp: 'USP',
    targetShelfLife: '타겟 소비기한',
    discontinueReason: '단종 사유',
  },
  review: {
    taskName: '검수 항목',
    department: '담당 부서',
    isCompleted: '완료 여부',
    reviewerName: '검수자',
    reviewerNote: '검수 의견',
  },
  launchTask: {
    name: '업무명',
    checkPoint: '체크포인트',
    isCompleted: '완료 여부',
    note: '비고',
  },
  user: {
    name: '이름',
    department: '부서',
    role: '권한',
  },
  launchStage: {
    name: '단계명',
    department: '담당 부서',
    ownerName: '담당자',
    ownerEmail: '담당자 이메일',
    status: '진행 상태',
    dueDate: '마감일',
  },
};

// 단종은 출시와 필드 구조가 같다
FIELD_LABELS.discontinuation = FIELD_LABELS.launch;

function labelFor(entityType, field) {
  return (FIELD_LABELS[entityType] || {})[field] || field;
}

// 코드값을 그대로 남기면 'planning → in_progress'처럼 읽히므로 필드별로 한글 표기로 바꾼다.
const VALUE_LABELS = {
  status: {
    planning: '기획',
    in_progress: '진행 중',
    completed: '완료',
    on_hold: '보류',
    pending: '대기',
    requested: '요청됨',
    delivered: '전달 완료',
    canceled: '취소',
  },
  role: {
    admin: '관리자',
    user: '일반',
  },
  stage: {
    lead: '영업 시작',
    contact: '관계 형성',
    proposal: '제안·미팅',
    revenue: '매출 기여',
    expansion: '제품 확대',
  },
};

function displayValue(field, value) {
  if (value === null) return null;
  const map = VALUE_LABELS[field];
  return (map && map[value]) || value;
}

// 값을 이력에 남길 문자열로 정규화 (날짜/불리언/객체/긴 텍스트 처리)
function normalize(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    // 시분초가 00:00이면 날짜만 (마감일·출시일 등)
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
  }
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    try {
      return truncate(JSON.stringify(v));
    } catch {
      return '(복합 값)';
    }
  }
  return truncate(String(v));
}

function truncate(s) {
  if (s.length <= MAX_VALUE_LEN) return s;
  return `${s.slice(0, MAX_VALUE_LEN)}…`;
}

function actorFields(actor) {
  if (!actor) return { actorId: null, actorName: null, actorEmail: null };
  return {
    actorId: actor.id || null,
    actorName: actor.name || null,
    actorEmail: actor.email || null,
  };
}

// before/after 스냅샷을 비교해 변경된 필드 목록을 만든다.
// fields를 주면 그 필드만 비교하고, 안 주면 after에 등장한 키를 기준으로 비교한다.
function diffFields(entityType, before, after, fields) {
  const keys = fields || Object.keys(after || {});
  const changes = [];
  for (const key of keys) {
    if (SECRET_FIELDS.has(key) || NOISE_FIELDS.has(key)) continue;
    if (!(key in (after || {}))) continue;
    const oldValue = normalize(before ? before[key] : null);
    const newValue = normalize(after[key]);
    if (oldValue === newValue) continue;
    changes.push({
      field: key,
      fieldLabel: labelFor(entityType, key),
      oldValue: displayValue(key, oldValue),
      newValue: displayValue(key, newValue),
    });
  }
  return changes;
}

// clientId는 UUID로 남으면 읽을 수 없으므로 거래처명으로 치환한다.
async function resolveClientNames(prisma, changes) {
  const targets = changes.filter((c) => c.field === 'clientId');
  if (!targets.length) return;
  const ids = [...new Set(targets.flatMap((c) => [c.oldValue, c.newValue]).filter(Boolean))];
  if (!ids.length) return;
  const clients = await prisma.salesClient.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  for (const c of targets) {
    if (c.oldValue) c.oldValue = nameById[c.oldValue] || '(삭제된 거래처)';
    if (c.newValue) c.newValue = nameById[c.newValue] || '(삭제된 거래처)';
  }
}

/**
 * 수정 이력 기록. 변경된 필드가 없으면 아무것도 남기지 않는다.
 * @returns 기록된 이력 건수
 */
async function logUpdate(prisma, { entityType, entityId, entityLabel, actor, before, after, fields }) {
  try {
    const changes = diffFields(entityType, before, after, fields);
    if (!changes.length) return 0;
    await resolveClientNames(prisma, changes);
    await prisma.changeLog.createMany({
      data: changes.map((c) => ({
        entityType,
        entityId,
        entityLabel: entityLabel || null,
        action: 'update',
        ...c,
        ...actorFields(actor),
      })),
    });
    return changes.length;
  } catch (e) {
    console.error('[changeLog] logUpdate 실패:', e.message);
    return 0;
  }
}

// 생성/삭제처럼 필드 단위가 아닌 이벤트 기록
async function logEvent(prisma, { entityType, entityId, entityLabel, action, summary, actor }) {
  try {
    await prisma.changeLog.create({
      data: {
        entityType,
        entityId,
        entityLabel: entityLabel || null,
        action,
        summary: summary || null,
        ...actorFields(actor),
      },
    });
  } catch (e) {
    console.error('[changeLog] logEvent 실패:', e.message);
  }
}

const logCreate = (prisma, args) => logEvent(prisma, { ...args, action: 'create' });
const logDelete = (prisma, args) => logEvent(prisma, { ...args, action: 'delete' });

module.exports = { logUpdate, logEvent, logCreate, logDelete, diffFields, labelFor, FIELD_LABELS };
