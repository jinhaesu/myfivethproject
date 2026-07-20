'use client';

// 수정 이력 공용 섹션 — 영업일지·출시·단종·검수 상세 화면에서 함께 사용한다.
// 한 번의 저장으로 여러 필드가 바뀐 경우 백엔드에 필드별로 여러 행이 쌓이므로,
// 화면에서는 '같은 작성자 + 같은 시각(초 단위)'을 하나의 변경 묶음으로 합쳐 보여준다.

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { userLabel } from '@/lib/user';
import { Card, Button, Spinner, Badge } from '@/components/ui';

export interface ChangeLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: 'create' | 'update' | 'delete' | string;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  summary: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

interface Group {
  key: string;
  createdAt: string;
  actor: string;
  action: string;
  entries: ChangeLogEntry[];
}

const ACTION_META: Record<string, { label: string; tone: 'success' | 'brand' | 'danger' | 'neutral' }> = {
  create: { label: '생성', tone: 'success' },
  update: { label: '수정', tone: 'brand' },
  delete: { label: '삭제', tone: 'danger' },
};

function groupEntries(logs: ChangeLogEntry[]): Group[] {
  const map = new Map<string, Group>();
  for (const log of logs) {
    // 초 단위로 잘라 같은 저장 동작을 하나로 묶는다 (밀리초는 필드마다 미세하게 다를 수 있음)
    const bucket = log.createdAt.slice(0, 19);
    const actor = userLabel(log.actorName, log.actorEmail);
    const key = `${bucket}|${log.actorId || actor}|${log.action}`;
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(log);
    } else {
      map.set(key, { key, createdAt: log.createdAt, actor, action: log.action, entries: [log] });
    }
  }
  return Array.from(map.values());
}

function fmt(d: string) {
  return new Date(d).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function Value({ v, tone }: { v: string | null; tone: 'old' | 'new' }) {
  if (v === null || v === '') {
    return <span className="text-[var(--text-4)] italic">(비어 있음)</span>;
  }
  return (
    <span className={tone === 'old' ? 'text-[var(--text-4)] line-through' : 'text-[var(--text-1)]'}>
      {v}
    </span>
  );
}

interface Props {
  /** 'journal' | 'project'(출시·단종 통합) | 'labelReview'(QCQA 검수) | 'client' | 'plan' 등 */
  entityType: string;
  entityId: string;
  /** 영업일지 열람 토큰 (비밀번호 잠금 해제 후) */
  viewToken?: string;
  /** entityType='project'이면 하위 단계·업무 이력까지 합쳐 조회 */
  title?: string;
}

export default function ChangeLogSection({ entityType, entityId, viewToken, title = '수정 이력' }: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ChangeLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data: ChangeLogEntry[];
      if (entityType === 'journal') {
        data = await api.changelog.journal(entityId, viewToken);
      } else if (entityType === 'project') {
        data = await api.changelog.project(entityId);
      } else if (entityType === 'labelReview') {
        data = await api.changelog.labelReview(entityId);
      } else {
        data = await api.changelog.list(entityType, entityId);
      }
      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || '변경 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, viewToken]);

  useEffect(() => {
    if (open && logs === null) load();
  }, [open, logs, load]);

  const groups = logs ? groupEntries(logs) : [];

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-[var(--bg-2)] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-1)]">{title}</span>
          {logs !== null && (
            <span className="text-[11px] text-[var(--text-4)]">{groups.length}건</span>
          )}
        </span>
        <span className="text-[11px] text-[var(--text-3)]">{open ? '접기' : '펼치기'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border-1)] px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-[12px] text-[var(--text-3)]">
              <Spinner /> 불러오는 중
            </div>
          )}
          {error && <p className="py-3 text-[12px] text-[var(--danger-fg)]">{error}</p>}
          {!loading && !error && groups.length === 0 && (
            <p className="py-3 text-[12px] text-[var(--text-4)]">아직 기록된 변경 이력이 없습니다.</p>
          )}

          <ol className="space-y-3">
            {groups.map((g) => {
              const meta = ACTION_META[g.action] || { label: g.action, tone: 'neutral' as const };
              return (
                <li key={g.key} className="border-l-2 border-[var(--border-1)] pl-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-[12px] text-[var(--text-2)]">{g.actor}</span>
                    <span className="text-[11px] text-[var(--text-4)]">{fmt(g.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {g.entries.map((e) => (
                      <div key={e.id} className="text-[12px] leading-relaxed break-words">
                        {/* 집계 뷰(출시 프로젝트·검수)에서는 어느 항목의 변경인지 먼저 보여준다 */}
                        {e.entityLabel && (
                          <span className="text-[var(--text-2)] font-medium mr-1.5">
                            [{e.entityLabel}]
                          </span>
                        )}
                        {e.action === 'update' && e.field ? (
                          <>
                            <span className="text-[var(--text-3)]">{e.fieldLabel || e.field}</span>
                            <span className="text-[var(--text-4)] mx-1.5">:</span>
                            <Value v={e.oldValue} tone="old" />
                            <span className="text-[var(--text-4)] mx-1.5">→</span>
                            <Value v={e.newValue} tone="new" />
                          </>
                        ) : (
                          <span className="text-[var(--text-2)]">{e.summary || meta.label}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>

          {logs !== null && (
            <div className="mt-3 pt-3 border-t border-[var(--border-1)]">
              <Button variant="ghost" size="xs" onClick={load} disabled={loading}>
                새로고침
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
