'use client';

import { LAUNCH_SCOPES } from '@/lib/launch';
import { SalesClient } from '@/lib/sales';
import { Field, Select } from '@/components/ui';

// 출시 대상 구분 + 대상 거래처 선택.
// brand는 대상 없음, client는 1곳, channel은 여러 곳 — 셋의 입력 방식이 달라 한 곳에 묶어둔다.
export default function LaunchScopePicker({
  scope,
  clientId,
  clientIds,
  clients,
  onScopeChange,
  onClientIdChange,
  onClientIdsChange,
  layout = 'cards',
}: {
  scope: string;
  clientId: string;
  clientIds: string[];
  clients: SalesClient[];
  onScopeChange: (v: string) => void;
  onClientIdChange: (v: string) => void;
  onClientIdsChange: (v: string[]) => void;
  layout?: 'cards' | 'compact';
}) {
  const toggle = (id: string) =>
    onClientIdsChange(
      clientIds.includes(id) ? clientIds.filter((x) => x !== id) : [...clientIds, id],
    );

  return (
    <div>
      {layout === 'cards' ? (
        <>
          <div className="text-[13px] font-medium text-[var(--text-1)] mb-2">출시 대상 구분</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {LAUNCH_SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onScopeChange(s.key)}
                className={
                  'text-left rounded-lg border p-3 transition-colors ' +
                  (scope === s.key
                    ? 'border-[var(--brand-500)] bg-[var(--bg-2)]'
                    : 'border-[var(--border-1)] hover:bg-[var(--bg-2)]')
                }
              >
                <div className="text-[13px] font-medium text-[var(--text-1)]">{s.label}</div>
                <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">{s.hint}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Field label="출시 대상 구분">
          <Select value={scope} onChange={(e) => onScopeChange(e.target.value)} inputSize="md">
            {LAUNCH_SCOPES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {scope === 'client' && (
        <div className="mt-3">
          <Field
            label="대상 거래처"
            required
            hint="이 거래처 상세 화면과 영업 캘린더 거래처 필터에 이 제품이 함께 표시됩니다."
          >
            <Select value={clientId} onChange={(e) => onClientIdChange(e.target.value)} inputSize="md">
              <option value="">거래처 선택</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {scope === 'channel' && (
        <div className="mt-3">
          <div className="text-[12.5px] font-medium text-[var(--text-2)]">
            대상 거래처 <span className="text-[var(--danger-fg)]">*</span>
            <span className="ml-1.5 text-[11.5px] font-normal text-[var(--text-4)]">
              {clientIds.length}곳 선택됨
            </span>
          </div>
          <p className="text-[11.5px] text-[var(--text-3)] mt-0.5 mb-2">
            고른 거래처 모두의 화면과 캘린더 필터에 이 제품이 표시됩니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {clients.map((c) => {
              const on = clientIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  className={
                    'inline-flex items-center h-7 px-2.5 rounded-full border text-[11.5px] transition-colors ' +
                    (on
                      ? 'border-[var(--brand-500)] bg-[var(--bg-2)] text-[var(--text-1)]'
                      : 'border-[var(--border-1)] text-[var(--text-3)] hover:bg-[var(--bg-2)]')
                  }
                >
                  {on ? '✓ ' : ''}
                  {c.name}
                </button>
              );
            })}
          </div>
          {clients.length === 0 && (
            <p className="text-[11.5px] text-[var(--text-4)]">등록된 거래처가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
