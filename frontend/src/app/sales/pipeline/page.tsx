'use client';

// 파이프라인 분석 — "어디서 막혀 있고, 왜 지고, 언제 돈이 들어오는가"
// 칸반 보드가 '지금 상태'를 보여준다면 이 화면은 '흐름의 문제'를 드러내는 용도다.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { fmtKRW, STAGE_TONE } from '@/lib/sales';
import { PageHeader, Card, CardHeader, Badge, CenterSpinner, EmptyState } from '@/components/ui';

interface StageRow {
  stage: string;
  label: string;
  count: number;
  expected: number;
  weighted: number;
  medianIdleDays: number;
  stalled: number;
}
interface Analytics {
  stageSummary: StageRow[];
  winLoss: {
    won: number;
    lost: number;
    open: number;
    winRate: number | null;
    lostByReason: { reason: string; count: number }[];
  };
  timeline: { month: string; expected: number; weighted: number; count: number }[];
  undatedOpenDeals: number;
  meetingPurposes: { purpose: string; count: number }[];
}

function Bar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = tone === 'danger' ? 'var(--danger-fg)' : 'var(--brand-500)';
  return (
    <div className="h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
      <div className="h-full transition-all duration-base" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function PipelineAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setData(await api.sales.pipelineAnalytics());
      } catch (e) {
        setError((e as Error)?.message || '분석 데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <SalesTabs />
        <CenterSpinner label="파이프라인 분석 중" />
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <SalesTabs />
        <PageHeader eyebrow="Pipeline" title="파이프라인 분석" />
        <Card padding="lg">
          <p className="text-[13px] text-[var(--danger-fg)]">{error || '데이터가 없습니다.'}</p>
        </Card>
      </AppLayout>
    );
  }

  const { stageSummary, winLoss, timeline, undatedOpenDeals, meetingPurposes } = data;
  const maxWeighted = Math.max(...stageSummary.map((s) => s.weighted), 1);
  const maxMonth = Math.max(...timeline.map((t) => t.expected), 1);
  const maxReason = Math.max(...winLoss.lostByReason.map((r) => r.count), 1);
  const maxPurpose = Math.max(...meetingPurposes.map((p) => p.count), 1);
  const totalWeighted = stageSummary.reduce((s, r) => s + r.weighted, 0);
  const hasData = stageSummary.some((s) => s.count > 0) || winLoss.won + winLoss.lost > 0;

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Pipeline"
        title="파이프라인 분석"
        description="단계별 병목·승패 사유·예상 계약일 기준 매출 타임라인을 봅니다."
      />

      {!hasData ? (
        <EmptyState
          title="분석할 영업 데이터가 없습니다"
          description="거래처를 등록하고 단계·예상 매출·예상 계약일을 입력하면 여기에 흐름이 그려집니다."
        />
      ) : (
        <div className="space-y-5">
          {/* 요약 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card padding="md">
              <div className="text-[11.5px] text-[var(--text-3)]">진행 중 가중 예상매출</div>
              <div className="text-[22px] font-semibold text-[var(--text-1)] mt-1">{fmtKRW(totalWeighted)}</div>
              <div className="text-[11.5px] text-[var(--text-4)] mt-0.5">진행 중 {winLoss.open}건</div>
            </Card>
            <Card padding="md">
              <div className="text-[11.5px] text-[var(--text-3)]">성사율</div>
              <div className="text-[22px] font-semibold text-[var(--text-1)] mt-1 tabular">
                {winLoss.winRate !== null ? `${winLoss.winRate}%` : '—'}
              </div>
              <div className="text-[11.5px] text-[var(--text-4)] mt-0.5">
                성사 {winLoss.won} · 실패 {winLoss.lost}
              </div>
            </Card>
            <Card padding="md">
              <div className="text-[11.5px] text-[var(--text-3)]">30일 이상 정체</div>
              <div className="text-[22px] font-semibold text-[var(--text-1)] mt-1 tabular">
                {stageSummary.reduce((s, r) => s + r.stalled, 0)}
                <span className="text-[13px] text-[var(--text-3)] ml-1">건</span>
              </div>
              <div className="text-[11.5px] text-[var(--text-4)] mt-0.5">마지막 활동 이후 무소식</div>
            </Card>
          </div>

          {/* 단계별 병목 */}
          <Card padding="lg">
            <CardHeader
              title="단계별 병목"
              subtitle="건수와 금액이 어느 단계에 묶여 있는지, 그리고 얼마나 오래 머물러 있는지를 봅니다."
            />
            <div className="space-y-3">
              {stageSummary.map((s) => (
                <div key={s.stage}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge tone={STAGE_TONE[s.stage] || 'neutral'} size="sm">
                        {s.label}
                      </Badge>
                      <span className="text-[12.5px] text-[var(--text-3)] tabular">{s.count}건</span>
                      {s.stalled > 0 && (
                        <Badge tone="warning" size="xs">
                          정체 {s.stalled}
                        </Badge>
                      )}
                    </span>
                    <span className="text-[12.5px] text-[var(--text-2)] tabular">
                      {fmtKRW(s.weighted)}
                      <span className="text-[var(--text-4)] ml-1.5">
                        / 예상 {fmtKRW(s.expected)}
                      </span>
                    </span>
                  </div>
                  <Bar value={s.weighted} max={maxWeighted} />
                  <div className="mt-1 text-[11px] text-[var(--text-4)]">
                    마지막 활동 이후 중앙값 {s.medianIdleDays}일
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 매출 타임라인 */}
          <Card padding="lg">
            <CardHeader
              title="예상 계약일 기준 매출 타임라인"
              subtitle="향후 12개월. 진행 중인 딜만 집계하며, 가중치는 성사 확률을 반영한 금액입니다."
            />
            {undatedOpenDeals > 0 && (
              <p className="text-[12px] text-[var(--warning-fg)] mb-3">
                ⚠ 예상 계약일이 없는 진행 중 딜 {undatedOpenDeals}건은 타임라인에 반영되지 않았습니다.{' '}
                <Link href="/sales/clients" className="underline">
                  거래처에서 날짜를 입력
                </Link>
                하면 예측이 정확해집니다.
              </p>
            )}
            <div className="touch-scroll-x">
              <div className="flex items-end gap-1.5 min-w-[560px] h-40">
                {timeline.map((t) => {
                  const h = maxMonth > 0 ? Math.round((t.expected / maxMonth) * 100) : 0;
                  const wh = maxMonth > 0 ? Math.round((t.weighted / maxMonth) * 100) : 0;
                  return (
                    <div key={t.month} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="w-full flex flex-col justify-end h-full relative">
                        {/* 예상(연한) 위에 가중(진한)을 겹쳐 그린다 */}
                        <div
                          className="w-full rounded-t-sm bg-[var(--bg-3)] absolute bottom-0"
                          style={{ height: `${h}%` }}
                          title={`예상 ${fmtKRW(t.expected)}`}
                        />
                        <div
                          className="w-full rounded-t-sm bg-[var(--brand-500)] absolute bottom-0"
                          style={{ height: `${wh}%` }}
                          title={`가중 ${fmtKRW(t.weighted)}`}
                        />
                      </div>
                      <span className="mt-1.5 text-[10px] text-[var(--text-4)] tabular whitespace-nowrap">
                        {t.month.slice(2).replace('-', '.')}
                      </span>
                      <span className="text-[10px] text-[var(--text-4)] tabular">{t.count || ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--text-4)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2 rounded-sm bg-[var(--brand-500)]" /> 가중 예상매출
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2 rounded-sm bg-[var(--bg-3)]" /> 예상매출(전액)
              </span>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 실패 사유 */}
            <Card padding="lg">
              <CardHeader title="실패(Lost) 사유" subtitle="왜 지는지 알아야 다음 건을 이깁니다." />
              {winLoss.lostByReason.length === 0 ? (
                <p className="text-[12.5px] text-[var(--text-4)]">
                  기록된 실패 건이 없습니다. 거래처를 &apos;실패&apos;로 종료할 때 사유를 남기면 집계됩니다.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {winLoss.lostByReason.map((r) => (
                    <div key={r.reason}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12.5px] text-[var(--text-2)] truncate">{r.reason}</span>
                        <span className="text-[12px] text-[var(--text-3)] tabular shrink-0">{r.count}건</span>
                      </div>
                      <Bar value={r.count} max={maxReason} tone="danger" />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 미팅 목적 분포 */}
            <Card padding="lg">
              <CardHeader
                title="미팅 목적 분포"
                subtitle="영업 활동이 어디에 쏠려 있는지 봅니다. 선택형으로 입력받은 값만 집계됩니다."
              />
              {meetingPurposes.length === 0 ? (
                <p className="text-[12.5px] text-[var(--text-4)]">집계할 영업일지가 없습니다.</p>
              ) : (
                <div className="space-y-2.5">
                  {meetingPurposes.slice(0, 8).map((p) => (
                    <div key={p.purpose}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12.5px] text-[var(--text-2)] truncate">{p.purpose}</span>
                        <span className="text-[12px] text-[var(--text-3)] tabular shrink-0">{p.count}건</span>
                      </div>
                      <Bar value={p.count} max={maxPurpose} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
