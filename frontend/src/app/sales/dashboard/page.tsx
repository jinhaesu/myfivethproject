'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { DashboardData, fmtKRW, fmtDate, STAGE_LABEL, STAGE_TONE } from '@/lib/sales';
import { PageHeader, Card, Badge, EmptyState, CenterSpinner } from '@/components/ui';

// Badge tone → CSS 색상 (파이프라인 바/강조용)
const TONE_COLOR: Record<string, string> = {
  neutral: 'var(--text-3)',
  info: 'var(--info-fg)',
  brand: 'var(--brand-400)',
  success: 'var(--success-fg)',
  violet: '#C084FC',
  warning: 'var(--warning-fg)',
  danger: 'var(--danger-fg)',
};

function stageColor(stage: string): string {
  return TONE_COLOR[STAGE_TONE[stage] || 'neutral'] || 'var(--text-3)';
}

function Stat({
  label,
  value,
  accent,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  emphasize?: boolean;
}) {
  return (
    <Card padding="md" className="hover-lift">
      <div
        className="text-[10.5px] uppercase tracking-[0.08em]"
        style={{ color: accent || 'var(--text-3)' }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[22px] font-semibold tabular"
        style={{ color: emphasize ? 'var(--brand-400)' : 'var(--text-1)' }}
      >
        {value}
      </div>
    </Card>
  );
}

export default function SalesDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.sales.dashboard();
        setData(res);
      } catch (e) {
        setError((e as Error)?.message || '영업 대시보드를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxWeighted =
    data && data.stageSummary.length
      ? Math.max(1, ...data.stageSummary.map((s) => s.weighted))
      : 1;

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Dashboard"
        title="영업 대시보드"
        description="파이프라인 예상매출·이번 주 활동·후속관리 현황을 한눈에"
        actions={
          data?.isSuperAdmin ? (
            <Badge tone="violet" size="sm">
              전체 집계 (최고관리자)
            </Badge>
          ) : undefined
        }
      />

      {loading ? (
        <CenterSpinner label="영업 대시보드 집계 중" />
      ) : error || !data ? (
        <Card padding="lg" className="max-w-md">
          <p className="text-[13px] text-[var(--text-2)]">{error || '데이터가 없습니다.'}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="총 거래처" value={data.totals.clients} />
            <Stat label="예상 매출" value={fmtKRW(data.totals.expectedTotal)} />
            <Stat
              label="가중 예상매출"
              value={fmtKRW(data.totals.weightedTotal)}
              accent="var(--brand-400)"
              emphasize
            />
            <Stat label="미완료 할일" value={data.totals.openTodos} accent="var(--warning-fg)" />
            <Stat label="이번 주 미팅" value={data.thisWeek.meetings} accent="var(--info-fg)" />
          </div>

          {/* 단계별 파이프라인 */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[var(--text-1)] font-semibold tracking-tight">단계별 파이프라인</div>
              <div className="text-[12.5px] text-[var(--text-3)]">
                가중 예상매출 합계{' '}
                <span className="text-[var(--brand-400)] font-semibold tabular">
                  {fmtKRW(data.totals.weightedTotal)}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {data.stageSummary.map((s) => {
                const color = stageColor(s.stage);
                const pct = Math.round((s.weighted / maxWeighted) * 100);
                return (
                  <div key={s.stage} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <span className="text-[var(--text-1)] font-medium">
                          {STAGE_LABEL[s.stage] || s.label}
                        </span>
                        <span className="text-[var(--text-4)] tabular">거래처 {s.count}</span>
                      </div>
                      <div className="tabular">
                        <span className="text-[var(--text-1)] font-semibold">{fmtKRW(s.weighted)}</span>
                        <span className="text-[var(--text-4)] ml-2">/ {fmtKRW(s.expected)}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--bg-3)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-base ease-out-soft"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 할일 + 정체 거래처 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card padding="lg">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[var(--text-1)] font-semibold tracking-tight">다가오는 할일</div>
                <span className="text-[11px] text-[var(--text-4)]">2주 이내</span>
              </div>
              {data.upcomingTodos.length ? (
                <div className="flex flex-col">
                  {data.upcomingTodos.map((t) => (
                    <Link
                      key={t.id}
                      href={`/sales/${t.journalId}`}
                      className="flex items-start gap-3 py-2 border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--bg-2)] rounded px-1 -mx-1 transition-colors"
                    >
                      <Badge tone={t.overdue ? 'danger' : 'warning'} size="xs">
                        {fmtDate(t.dueDate)}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-[var(--text-1)] truncate">{t.content}</div>
                        {t.clientName && (
                          <div className="text-[11.5px] text-[var(--text-3)] truncate">{t.clientName}</div>
                        )}
                      </div>
                      {t.overdue && (
                        <Badge tone="danger" size="xs">
                          지연
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--text-4)] py-2">예정된 할일이 없습니다.</p>
              )}
            </Card>

            <Card padding="lg">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[var(--text-1)] font-semibold tracking-tight">정체 거래처</div>
                <span className="text-[11px] text-[var(--text-4)]">14일 이상 활동 없음</span>
              </div>
              {data.staleClients.length ? (
                <div className="flex flex-col">
                  {data.staleClients.map((c) => (
                    <Link
                      key={c.id}
                      href={`/sales/clients/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--bg-2)] rounded px-1 -mx-1 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] text-[var(--text-1)] truncate">{c.name}</span>
                        <Badge tone={STAGE_TONE[c.stage] || 'neutral'} size="xs">
                          {STAGE_LABEL[c.stage] || c.stage}
                        </Badge>
                      </div>
                      <Badge tone={c.days >= 30 ? 'danger' : 'warning'} size="xs">
                        {c.days}일째 무접촉
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--text-4)] py-2">정체된 거래처가 없습니다.</p>
              )}
            </Card>
          </div>

          {/* 최근 영업일지 */}
          <Card padding="lg">
            <div className="text-[var(--text-1)] font-semibold tracking-tight mb-3">최근 영업일지</div>
            {data.recentJournals.length ? (
              <div className="flex flex-col">
                {data.recentJournals.map((j) => (
                  <Link
                    key={j.id}
                    href={`/sales/${j.id}`}
                    className="flex items-center gap-3 py-2 border-b border-[var(--border-1)] last:border-0 hover:bg-[var(--bg-2)] rounded px-1 -mx-1 transition-colors"
                  >
                    <span className="text-[13px] text-[var(--text-1)] truncate flex-1">
                      {j.title || '(제목 없음)'}
                    </span>
                    {j.clientName && (
                      <span className="hidden sm:inline text-[12px] text-[var(--text-3)] truncate max-w-[140px]">
                        {j.clientName}
                      </span>
                    )}
                    {j.stage && (
                      <Badge tone={STAGE_TONE[j.stage] || 'neutral'} size="xs">
                        {STAGE_LABEL[j.stage] || j.stage}
                      </Badge>
                    )}
                    <span className="hidden md:inline text-[11.5px] text-[var(--text-4)] tabular">
                      {j.authorName || ''}
                    </span>
                    <span className="text-[11.5px] text-[var(--text-4)] tabular flex-shrink-0">
                      {fmtDate(j.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="최근 영업일지가 없습니다" description="영업일지를 작성하면 여기에 표시됩니다." />
            )}
          </Card>
        </div>
      )}
    </AppLayout>
  );
}
