'use client';

// 영업일지 작성 화면의 "무엇이 왜 부족한지" 표시 묶음.
// 규칙 자체는 lib/journalQuality.ts 한 곳에 있고, 여기는 그걸 보여주기만 한다.

import { Field, Textarea, Badge } from '@/components/ui';
import {
  JOURNAL_TEXT_FIELDS,
  JournalCheck,
  JournalIssue,
  contentLength,
} from '@/lib/journalQuality';

function ruleOf(key: string) {
  return JOURNAL_TEXT_FIELDS.find((f) => f.key === key);
}

// 최소 분량이 걸린 서술형 칸 — 남은 글자수를 실시간으로 보여준다.
// 다 쓰고 저장 버튼에서 튕기는 게 제일 나쁜 경험이라 입력 중에 알려준다.
export function CountedTextarea({
  fieldKey,
  value,
  onChange,
  placeholder,
  rows,
  label,
  hint,
  className,
}: {
  fieldKey: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const rule = ruleOf(fieldKey);
  const min = rule?.min ?? 0;
  const len = contentLength(value);
  const ok = len >= min;
  const shown = label ?? rule?.label ?? '';
  const helper = hint ?? rule?.hint;

  return (
    <Field
      label={
        <span className="inline-flex items-center gap-2">
          {shown}
          <span
            className={
              'text-[11px] font-normal tabular-nums ' +
              (len === 0
                ? 'text-[var(--text-3)]'
                : ok
                  ? 'text-[var(--success-fg)]'
                  : 'text-[var(--warning-fg)]')
            }
          >
            {len}/{min}자
          </span>
        </span>
      }
      required
      hint={helper}
      className={className}
    >
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </Field>
  );
}

// 저장 전 체크리스트 — 남은 항목만 보여주면 "몇 개 남았는지"를 알 수 없어 전부 보여준다.
export function JournalChecklist({
  checks,
  issues,
}: {
  checks: JournalCheck[];
  issues: JournalIssue[];
}) {
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const pct = total ? Math.round((passed / total) * 100) : 0;
  const done = passed === total;

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[13px] font-semibold text-[var(--text-1)]">작성 완성도</span>
        <Badge tone={done ? 'success' : pct >= 60 ? 'warning' : 'danger'}>
          {passed}/{total} · {pct}%
        </Badge>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden mb-3">
        <div
          className={
            'h-full transition-all ' +
            (done ? 'bg-[var(--success-fg)]' : pct >= 60 ? 'bg-[var(--warning-fg)]' : 'bg-[var(--danger-fg)]')
          }
          style={{ width: `${pct}%` }}
        />
      </div>

      {done ? (
        <p className="text-[12px] text-[var(--success-fg)]">필수 구성이 모두 채워졌습니다. 저장할 수 있습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {issues.map((i, idx) => (
            <li key={`${i.key}-${idx}`} className="flex gap-2 text-[12px] leading-[1.5] text-[var(--text-2)]">
              <span className="text-[var(--danger-fg)] shrink-0 mt-[1px]">✕</span>
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}

      {done ? null : (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-1">
          {checks
            .filter((c) => c.ok)
            .map((c) => (
              <span
                key={c.key}
                className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success-fg)]"
              >
                ✓ {c.label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// 목록·상세에서 부실한 일지를 드러내는 배지
export function CompletenessBadge({
  score,
  missing,
}: {
  score: number;
  missing?: string[];
}) {
  const tone = score >= 100 ? 'success' : score >= 60 ? 'warning' : 'danger';
  const title = missing?.length ? `보완 필요: ${missing.join(', ')}` : '필수 구성 충족';
  return (
    <span title={title}>
      <Badge tone={tone}>{score >= 100 ? '구성 충족' : `보완 필요 ${score}%`}</Badge>
    </span>
  );
}
