// ============================================================
// 영업일지 최소 구성 규칙 (Single Source of Truth)
//
// 왜 최소 글자수까지 두는가 —
// 실제 저장된 일지를 보면 '미팅 개요'가 22자짜리(제목 재진술)인 건이 대다수였고,
// 향후 스케쥴의 '대략적 계획'은 전 건이 비어 있었다. 즉 "칸이 채워졌는지"만 보면
// 통과하지만 읽는 사람에게 정보가 남지 않는다. 그래서 항목별로 최소 분량을 둔다.
//
// frontend/src/lib/journalQuality.ts 와 규칙이 1:1로 같아야 한다. 한쪽만 고치지 말 것.
// ============================================================

// 글자수를 셀 때 공백·줄바꿈은 빼고 센다 — 개행만 넣어 분량을 늘리는 걸 막는다
function contentLength(v) {
  return String(v ?? '').replace(/\s+/g, '').length;
}

// 복붙 비교용 정규화 — 공백·문장부호·번호매김 제거
function normalizeText(v) {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[\s ]+/g, '')
    .replace(/[.,·・\-–—()[\]{}"'`~!?:;/\\|]+/g, '')
    .replace(/^\d+[)\].]?/gm, '');
}

// 서술형 필수 항목 — min은 공백 제외 글자수
const JOURNAL_TEXT_FIELDS = [
  { key: 'title', label: '제목', min: 6 },
  { key: 'meetingPurpose', label: '미팅 목적', min: 6 },
  { key: 'meetingLocation', label: '장소', min: 2 },
  {
    key: 'attendees',
    label: '참석자 정보',
    min: 10,
    hint: '우리측/거래처측을 구분하고 직함까지 적습니다.',
  },
  {
    key: 'meetingSummary',
    label: '미팅 개요',
    min: 80,
    hint: '무엇을 왜 논의했는지 3문장 이상. 제목을 다시 쓴 수준이면 통과하지 않습니다.',
  },
  {
    key: 'keyRequests',
    label: '핵심 요청사항',
    min: 40,
    hint: '거래처가 요구한 것을 요구한 주체와 함께 적습니다.',
  },
  {
    key: 'productRequests',
    label: '제품의 구체적 요청 및 기획사항',
    min: 40,
    hint: '중량·단가·규격·맛 등 숫자를 그대로 남깁니다.',
  },
  {
    key: 'decisions',
    label: '결정 사항',
    min: 30,
    hint: '이번 미팅에서 확정된 것. 확정된 게 없으면 "확정 없음 — 사유"까지 적습니다.',
  },
  {
    key: 'risks',
    label: '리스크·장애 요인',
    min: 20,
    hint: '이 건을 깨뜨릴 수 있는 요인과 대응 방향. 없으면 "현재 식별된 리스크 없음 — 근거".',
  },
  {
    key: 'nextContactPlan',
    label: '다음 접촉까지의 계획',
    min: 20,
    hint: '다음 접촉일까지 우리가 무엇을 해서 무엇을 얻어낼 것인지.',
  },
];

// 복붙 감지 대상 — 서로 다른 칸에 같은 문단을 넣는 걸 막는다
const DUPLICATE_CHECK_FIELDS = [
  'meetingSummary',
  'keyRequests',
  'productRequests',
  'decisions',
  'risks',
  'nextContactPlan',
];

const TODO_MIN_COUNT = 2;
const TODO_PLAN_MIN = 10;

// 알맹이 없는 상투어 — 이것만으로 채운 칸은 통과시키지 않는다
const FILLER_PATTERNS = [
  /^(특이사항\s*)?없음\.?$/,
  /^해당\s*없음\.?$/,
  /^(추후|차후)\s*(협의|확인|논의)\.?$/,
  /^미정\.?$/,
  /^n\/?a$/i,
  /^-+$/,
];

function isFiller(v) {
  const s = String(v ?? '').trim();
  if (!s) return true;
  return FILLER_PATTERNS.some((re) => re.test(s));
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 날짜 비교는 '일' 단위로 — 시각 때문에 하루 차이가 나면 안 된다
function dayNumber(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// ============================================================
// 검사 본체 — { issues: [{ key, label, message }], checks: [{ key, label, ok }] }
// body 는 작성 폼이 보내는 모양(todos 배열 포함)을 그대로 받는다.
// ============================================================
function inspectJournal(body, { partial = false } = {}) {
  const issues = [];
  const checks = [];
  const push = (key, label, ok, message) => {
    checks.push({ key, label, ok });
    if (!ok) issues.push({ key, label, message });
  };

  // ── 서술형 항목 ──
  for (const f of JOURNAL_TEXT_FIELDS) {
    if (partial && body[f.key] === undefined) continue;
    const raw = String(body[f.key] ?? '').trim();
    const len = contentLength(raw);
    if (!raw) {
      push(f.key, f.label, false, `${f.label}을(를) 입력해주세요.`);
    } else if (isFiller(raw)) {
      push(f.key, f.label, false, `${f.label}: "${raw}" 처럼 내용 없는 답은 받지 않습니다. ${f.hint || ''}`.trim());
    } else if (len < f.min) {
      push(f.key, f.label, false, `${f.label}: ${f.min}자 이상 필요합니다. (현재 ${len}자)`);
    } else {
      push(f.key, f.label, true);
    }
  }

  // ── 영업 단계 / 미팅 일자 ──
  if (!partial || body.stage !== undefined) {
    push('stage', '영업 단계', !!String(body.stage ?? '').trim(), '영업 단계를 선택해주세요.');
  }
  const meetingDate = toDate(body.meetingDate);
  if (!partial || body.meetingDate !== undefined) {
    push('meetingDate', '미팅 일자', !!meetingDate, '미팅 일자를 입력해주세요.');
  }

  // ── 미팅 개요가 제목의 재진술인지 ──
  if (body.meetingSummary !== undefined && body.title !== undefined) {
    const s = normalizeText(body.meetingSummary);
    const t = normalizeText(body.title);
    const echoed = !!s && !!t && (s === t || (t.length >= 6 && s.includes(t) && s.length < t.length * 1.8));
    if (echoed) {
      issues.push({
        key: 'meetingSummary',
        label: '미팅 개요',
        message: '미팅 개요가 제목을 거의 그대로 옮긴 수준입니다. 논의된 내용을 실제로 적어주세요.',
      });
      const c = checks.find((x) => x.key === 'meetingSummary');
      if (c) c.ok = false;
    }
  }

  // ── 칸 사이 복붙 ──
  const seen = new Map();
  for (const key of DUPLICATE_CHECK_FIELDS) {
    const norm = normalizeText(body[key]);
    if (norm.length < 20) continue;
    const prev = seen.get(norm);
    const label = JOURNAL_TEXT_FIELDS.find((f) => f.key === key)?.label || key;
    if (prev) {
      issues.push({ key, label, message: `${prev} 와 ${label} 의 내용이 같습니다. 항목별로 다른 내용을 적어주세요.` });
      const c = checks.find((x) => x.key === key);
      if (c) c.ok = false;
    } else {
      seen.set(norm, label);
    }
  }

  // ── 다음 접촉 예정일 ──
  if (!partial || body.nextContactDate !== undefined) {
    const next = toDate(body.nextContactDate);
    let ok = !!next;
    let msg = '다음 접촉 예정일을 지정해주세요. 다음 일정이 없는 건이 가장 먼저 죽습니다.';
    if (next && meetingDate && dayNumber(next) <= dayNumber(meetingDate)) {
      ok = false;
      msg = '다음 접촉 예정일은 미팅 일자보다 뒤여야 합니다.';
    }
    push('nextContactDate', '다음 접촉 예정일', ok, msg);
  }

  // ── 향후 스케쥴(todos) ──
  if (!partial || body.todos !== undefined) {
    const rows = Array.isArray(body.todos) ? body.todos : [];
    const filled = rows.filter((t) => t && t.dueDate && String(t.content || '').trim());
    if (filled.length < TODO_MIN_COUNT) {
      push('todos', '향후 스케쥴', false, `향후 스케쥴은 ${TODO_MIN_COUNT}건 이상 필요합니다. (현재 ${filled.length}건) 일자와 해야 할 일을 함께 적습니다.`);
    } else {
      const noPlan = filled.filter((t) => contentLength(t.plan) < TODO_PLAN_MIN || isFiller(t.plan));
      const contents = filled.map((t) => normalizeText(t.content));
      const dupIdx = contents.findIndex((c, i) => contents.indexOf(c) !== i);
      const future = filled.filter((t) => {
        const d = toDate(t.dueDate);
        return d && (!meetingDate || dayNumber(d) > dayNumber(meetingDate));
      });
      if (noPlan.length) {
        push('todos', '향후 스케쥴', false, `향후 스케쥴 ${noPlan.length}건에 '대략적 계획'이 없습니다. 각 항목마다 어떻게 할 것인지 ${TODO_PLAN_MIN}자 이상 적어주세요.`);
      } else if (dupIdx >= 0) {
        push('todos', '향후 스케쥴', false, `향후 스케쥴에 같은 내용이 중복돼 있습니다: "${filled[dupIdx].content}"`);
      } else if (!future.length) {
        push('todos', '향후 스케쥴', false, '향후 스케쥴은 미팅 일자 이후의 일정이 최소 1건 있어야 합니다.');
      } else {
        push('todos', '향후 스케쥴', true);
      }
    }
  }

  // ── 견적 ──
  if (body.hasQuote) {
    const rows = Array.isArray(body.quoteItems) ? body.quoteItems : [];
    const valid = rows.filter((q) => q && String(q.productName || '').trim());
    const priced = valid.filter((q) => String(q.price || '').trim());
    if (!valid.length) {
      push('quoteItems', '견적 항목', false, '견적 제안을 체크했으면 제품명이 있는 견적 항목이 1건 이상 필요합니다.');
    } else if (priced.length < valid.length) {
      push('quoteItems', '견적 항목', false, '견적 항목마다 제안가격을 입력해주세요. 가격 없는 견적은 기록으로 남지 않습니다.');
    } else {
      push('quoteItems', '견적 항목', true);
    }
  }

  return { issues, checks };
}

// 통과 여부만 필요한 곳(저장 게이트)용
function journalIssues(body, opts) {
  return inspectJournal(body, opts).issues;
}

// ============================================================
// 완성도 점수 — 저장된 일지(DB 레코드)를 그대로 넣어 계산한다.
// 목록·대시보드에서 부실한 일지를 눈에 띄게 하는 용도.
// ============================================================
function journalCompleteness(journal) {
  if (!journal) return { score: 0, missing: [], total: 0, passed: 0 };
  const body = {
    ...journal,
    todos: journal.todos || [],
    quoteItems: journal.quoteItems || [],
    hasQuote: !!journal.hasQuote,
  };
  const { checks } = inspectJournal(body, { partial: false });
  const total = checks.length;
  const passed = checks.filter((c) => c.ok).length;
  return {
    score: total ? Math.round((passed / total) * 100) : 0,
    passed,
    total,
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  };
}

module.exports = {
  JOURNAL_TEXT_FIELDS,
  TODO_MIN_COUNT,
  TODO_PLAN_MIN,
  contentLength,
  normalizeText,
  isFiller,
  inspectJournal,
  journalIssues,
  journalCompleteness,
};
