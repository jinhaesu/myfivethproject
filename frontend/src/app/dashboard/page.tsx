'use client';

// 대시보드 — 전사 최근 변경 활동 피드.
// "지난주에 누가 뭘 바꿨나"를 한 화면에서 보기 위한 화면으로,
// 개별 자료의 상세 이력은 각 상세 페이지의 '수정 이력' 섹션에서 본다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PageHeader, Card, Button, Badge, CenterSpinner, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

interface FeedItem {
  id: string;
  entityType: string;
  entityId: string;
  typeLabel: string;
  group: 'sales' | 'launch' | 'review' | 'etc' | string;
  targetName: string | null;
  url: string | null;
  deleted: boolean;
  action: 'create' | 'update' | 'delete' | string;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  summary: string | null;
  masked: boolean;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; tone: 'success' | 'brand' | 'danger' | 'neutral' }> = {
  create: { label: '생성', tone: 'success' },
  update: { label: '수정', tone: 'brand' },
  delete: { label: '삭제', tone: 'danger' },
};

const GROUPS = [
  { key: '', label: '전체' },
  { key: 'sales', label: '영업' },
  { key: 'launch', label: '출시·단종' },
  { key: 'review', label: '표기사항' },
];

const RANGES = [
  { days: 7, label: '최근 7일' },
  { days: 30, label: '최근 30일' },
  { days: 90, label: '최근 90일' },
];

// 오늘/어제/그 이전으로 나눠 날짜 헤더를 붙인다
function dayKey(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function actorOf(f: FeedItem) {
  return f.actorName || f.actorEmail?.split('@')[0] || '알 수 없음';
}

function ValueDiff({ f }: { f: FeedItem }) {
  if (f.masked) {
    return <span className="text-[var(--text-4)]">🔒 비밀번호가 걸린 일지 — 변경 내용 비공개</span>;
  }
  if (f.action !== 'update' || !f.fieldLabel) {
    return <span className="text-[var(--text-2)]">{f.summary || ACTION_META[f.action]?.label || f.action}</span>;
  }
  return (
    <>
      <span className="text-[var(--text-3)]">{f.fieldLabel}</span>
      <span className="text-[var(--text-4)] mx-1.5">:</span>
      {f.oldValue ? (
        <span className="text-[var(--text-4)] line-through">{f.oldValue}</span>
      ) : (
        <span className="text-[var(--text-4)] italic">(비어 있음)</span>
      )}
      <span className="text-[var(--text-4)] mx-1.5">→</span>
      {f.newValue ? (
        <span className="text-[var(--text-1)]">{f.newValue}</span>
      ) : (
        <span className="text-[var(--text-4)] italic">(비어 있음)</span>
      )}
    </>
  );
}

export default function DashboardPage() {
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [group, setGroup] = useState('');
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.changelog.recent({ days, limit: 150, group: group || undefined });
      setFeed(data.feed || []);
    } catch (e) {
      setError((e as Error)?.message || '최근 활동을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [days, group]);

  useEffect(() => {
    load();
  }, [load]);

  // 요약 지표 — 기간 내 변경 건수 / 참여자 수 / 가장 많이 바뀐 대상
  const stats = useMemo(() => {
    if (!feed) return null;
    const actors = new Set(feed.map((f) => f.actorEmail || f.actorName || '?'));
    const byTarget = new Map<string, { name: string; url: string | null; count: number }>();
    for (const f of feed) {
      if (!f.targetName) continue;
      const key = `${f.entityType}:${f.entityId}`;
      const cur = byTarget.get(key);
      if (cur) cur.count += 1;
      else byTarget.set(key, { name: f.targetName, url: f.url, count: 1 });
    }
    const top = Array.from(byTarget.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    return { total: feed.length, actors: actors.size, top };
  }, [feed]);

  // 날짜별 그룹핑
  const sections = useMemo(() => {
    if (!feed) return [];
    const map = new Map<string, FeedItem[]>();
    for (const f of feed) {
      const k = dayKey(f.createdAt);
      const arr = map.get(k);
      if (arr) arr.push(f);
      else map.set(k, [f]);
    }
    return Array.from(map.entries());
  }, [feed]);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Dashboard"
        title="대시보드"
        description="영업·출시·단종·표기사항에서 일어난 최근 변경 사항을 한 곳에서 확인합니다."
        actions={
          <Button variant="secondary" size="md" onClick={load} disabled={loading}>
            새로고침
          </Button>
        }
      />

      {/* 요약 지표 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Card padding="md">
          <div className="text-[11.5px] text-[var(--text-3)]">기간 내 변경</div>
          <div className="text-[24px] font-semibold text-[var(--text-1)] tabular mt-1">
            {stats ? stats.total : '—'}
            <span className="text-[13px] text-[var(--text-3)] ml-1">건</span>
          </div>
        </Card>
        <Card padding="md">
          <div className="text-[11.5px] text-[var(--text-3)]">변경한 사람</div>
          <div className="text-[24px] font-semibold text-[var(--text-1)] tabular mt-1">
            {stats ? stats.actors : '—'}
            <span className="text-[13px] text-[var(--text-3)] ml-1">명</span>
          </div>
        </Card>
        <Card padding="md">
          <div className="text-[11.5px] text-[var(--text-3)]">가장 많이 바뀐 자료</div>
          {stats && stats.top.length ? (
            <ul className="mt-1.5 space-y-1">
              {stats.top.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-2 text-[12.5px] min-w-0">
                  {t.url ? (
                    <Link href={t.url} className="text-[var(--text-2)] hover:text-[var(--text-1)] truncate">
                      {t.name}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-2)] truncate">{t.name}</span>
                  )}
                  <span className="text-[var(--text-4)] tabular flex-shrink-0">{t.count}건</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[13px] text-[var(--text-4)] mt-2">—</div>
          )}
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className={cn(
                'px-2.5 py-1.5 min-h-[36px] rounded-md text-[12.5px] transition-colors',
                group === g.key
                  ? 'text-[var(--text-1)] bg-[var(--bg-2)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={cn(
                'px-2.5 py-1.5 min-h-[36px] rounded-md text-[12.5px] transition-colors',
                days === r.days
                  ? 'text-[var(--text-1)] bg-[var(--bg-2)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 피드 */}
      {loading && <CenterSpinner label="최근 활동 불러오는 중" />}
      {error && !loading && (
        <Card padding="lg">
          <p className="text-[13px] text-[var(--danger-fg)]">{error}</p>
        </Card>
      )}
      {!loading && !error && feed && feed.length === 0 && (
        <EmptyState
          title="이 기간에 기록된 변경이 없습니다"
          description="자료를 수정하면 여기에 활동이 쌓입니다. 수정 이력은 기능이 적용된 시점부터 기록됩니다."
        />
      )}

      {!loading && !error && sections.length > 0 && (
        <div className="space-y-6">
          {sections.map(([day, items]) => (
            <div key={day}>
              <div className="text-[12px] font-semibold text-[var(--text-3)] mb-2">{day}</div>
              <Card padding="none">
                <ul className="divide-y divide-[var(--border-1)]">
                  {items.map((f) => {
                    const meta = ACTION_META[f.action] || { label: f.action, tone: 'neutral' as const };
                    return (
                      <li key={f.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                          <Badge tone={meta.tone} size="sm">
                            {meta.label}
                          </Badge>
                          <span className="text-[11.5px] text-[var(--text-4)]">{f.typeLabel}</span>
                          {f.deleted ? (
                            <span className="text-[13px] text-[var(--text-4)]">삭제된 자료</span>
                          ) : f.url ? (
                            <Link
                              href={f.url}
                              className="text-[13px] text-[var(--text-1)] hover:underline truncate max-w-full"
                            >
                              {f.targetName}
                            </Link>
                          ) : (
                            <span className="text-[13px] text-[var(--text-1)] truncate">{f.targetName}</span>
                          )}
                        </div>
                        <div className="text-[12.5px] leading-relaxed break-words">
                          <ValueDiff f={f} />
                        </div>
                        <div className="mt-1 text-[11.5px] text-[var(--text-4)]">
                          {actorOf(f)} · {fmtTime(f.createdAt)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
