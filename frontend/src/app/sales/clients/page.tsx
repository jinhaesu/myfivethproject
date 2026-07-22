'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import {
  SalesClient,
  SALES_STAGES,
  STAGE_LABEL,
  DEAL_STATUS_LABEL,
  DEAL_STATUS_TONE,
  fmtKRW,
  fmtDate,
  weightedRevenue,
  dealStatusOf,
  isOpenDeal,
} from '@/lib/sales';
import {
  PageHeader,
  Card,
  Button,
  Select,
  Badge,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';
import { cn } from '@/lib/cn';

export default function SalesClientsPage() {
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 드래그 중인 카드 id / 드롭 대상 단계 — 시각적 피드백용
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.sales.listClients();
      setClients(data.clients);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 단계 이동 — 화면을 먼저 바꾸고(낙관적), 실패하면 원래대로 되돌린다
  const moveStage = async (id: string, stage: string) => {
    const target = clients.find((c) => c.id === id);
    if (!target || target.stage === stage) return;
    const snapshot = clients;
    setError('');
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)));
    try {
      await api.sales.updateClient(id, { stage });
      await load();
    } catch (err) {
      setClients(snapshot);
      setError(
        `${target.name} 단계 이동에 실패했습니다. ${(err as Error)?.message || ''}`.trim(),
      );
    }
  };

  const handleDragStart = (e: React.DragEvent, c: SalesClient) => {
    setDragId(c.id);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox는 dataTransfer에 값이 없으면 드래그를 시작하지 않는다
    e.dataTransfer.setData('text/plain', c.id);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOver(null);
  };

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== stageKey) setDragOver(stageKey);
  };

  // 자식 요소로 옮겨갈 때도 dragleave가 터지므로, 컬럼 밖으로 나갈 때만 해제한다
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    setDragOver(null);
    if (id) moveStage(id, stageKey);
  };

  // 성사·실패로 종료된 딜은 파이프라인 금액에 섞이면 예측이 왜곡되므로 분리한다
  const openDeals = clients.filter(isOpenDeal);
  const closedDeals = clients.filter((c) => !isOpenDeal(c));
  const byStage = (stageKey: string) => openDeals.filter((c) => c.stage === stageKey);

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Pipeline"
        title="거래처"
        description="영업 단계별 거래처 파이프라인. 카드를 드래그해 단계를 옮길 수 있습니다."
        actions={
          <Link href="/sales/clients/new">
            <Button variant="primary" size="md">
              + 거래처 등록
            </Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-3 rounded-md border border-[var(--danger-fg)] bg-[var(--bg-2)] px-3 py-2 text-[12.5px] text-[var(--danger-fg)]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <CenterSpinner label="거래처 불러오는 중" />
      ) : clients.length === 0 ? (
        <EmptyState
          title="등록된 거래처가 없습니다"
          description="영업 파이프라인 관리를 시작하려면 거래처를 등록하세요."
          action={
            <Link href="/sales/clients/new">
              <Button variant="primary" size="md">
                + 첫 거래처 등록
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* 모바일에서는 단계 컬럼이 화면을 넘어가므로 스크롤 가능함을 알린다.
              터치 기기는 HTML5 드래그가 동작하지 않아 카드마다 단계 드롭다운을 둔다. */}
          <p className="sm:hidden text-[11.5px] text-[var(--text-4)] mb-2">
            좌우로 밀어서 다른 영업 단계를 볼 수 있습니다 → (단계 이동은 카드 아래 드롭다운)
          </p>
          <div className="touch-scroll-x pb-2">
            <div className="flex gap-3 min-w-max">
              {SALES_STAGES.map((stage) => {
                const list = byStage(stage.key);
                const stageWeighted = list.reduce((sum, c) => sum + weightedRevenue(c), 0);
                const isTarget = dragOver === stage.key;
                return (
                  <div
                    key={stage.key}
                    className="w-[80vw] max-w-[264px] sm:w-[264px] flex-shrink-0"
                    onDragOver={(e) => handleDragOver(e, stage.key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stage.key)}
                  >
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span className="text-[12.5px] font-medium text-[var(--text-2)]">
                        {stage.label}
                      </span>
                      <span className="text-[11px] tabular text-[var(--text-4)] bg-[var(--bg-2)] rounded-full px-2 py-0.5">
                        {list.length}
                      </span>
                    </div>
                    {stageWeighted > 0 ? (
                      <div className="px-1 mb-2 text-[11px] text-[var(--text-4)] tabular">
                        가중 {fmtKRW(stageWeighted)}
                      </div>
                    ) : (
                      <div className="mb-2" />
                    )}
                    <div
                      className={cn(
                        'flex flex-col gap-2 rounded-lg transition-colors min-h-[80px] p-1 -m-1',
                        isTarget && 'bg-[var(--bg-2)] ring-1 ring-[var(--brand-400)]',
                      )}
                    >
                      {list.map((c) => {
                        const primary = c.contacts && c.contacts[0];
                        return (
                          <div
                            key={c.id}
                            className={cn(
                              'relative group sm:cursor-grab sm:active:cursor-grabbing',
                              dragId === c.id && 'opacity-40',
                            )}
                            draggable
                            onDragStart={(e) => handleDragStart(e, c)}
                            onDragEnd={handleDragEnd}
                          >
                            {/* draggable={false}로 링크 자체의 기본 드래그(URL 끌기)를 막는다 */}
                            <Link href={`/sales/clients/${c.id}`} draggable={false}>
                              <Card interactive padding="sm" className="cursor-pointer">
                                <div className="text-[13.5px] font-semibold text-[var(--text-1)] truncate">
                                  {c.name}
                                </div>
                                {c.bizNumber ? (
                                  <div className="text-[11px] text-[var(--text-4)] tabular mt-0.5">
                                    {c.bizNumber}
                                  </div>
                                ) : null}
                                {primary ? (
                                  <div className="text-[11.5px] text-[var(--text-3)] mt-1.5 truncate">
                                    {primary.name}
                                    {primary.title ? (
                                      <span className="text-[var(--text-4)]"> · {primary.title}</span>
                                    ) : null}
                                  </div>
                                ) : null}
                                {c.expectedRevenue ? (
                                  <div className="mt-1.5 text-[11.5px] text-[var(--text-2)] tabular">
                                    {fmtKRW(c.expectedRevenue)}
                                    <span className="text-[10.5px] text-[var(--text-4)] ml-1.5">
                                      가중 {fmtKRW(weightedRevenue(c))}
                                    </span>
                                  </div>
                                ) : null}
                                {c.expectedCloseDate ? (
                                  <div className="mt-1 text-[11px] text-[var(--text-4)] tabular">
                                    예상 계약 {fmtDate(c.expectedCloseDate)}
                                  </div>
                                ) : null}
                                <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--text-4)] tabular">
                                  <span>일지 {c._count?.journals ?? 0}</span>
                                  <span className="text-[var(--border-3)]">·</span>
                                  <span>계획 {c._count?.plans ?? 0}</span>
                                </div>
                              </Card>
                            </Link>
                            {/* 터치 기기용 단계 이동 (데스크톱에서는 드래그와 병행) */}
                            <div
                              className="mt-1"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <Select
                                inputSize="sm"
                                value={c.stage}
                                onChange={(e) => moveStage(c.id, e.target.value)}
                                className="text-[11.5px]"
                                aria-label={`${c.name} 영업 단계 이동`}
                              >
                                {SALES_STAGES.map((s) => (
                                  <option key={s.key} value={s.key}>
                                    {s.label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                      {list.length === 0 ? (
                        <div className="text-[11.5px] text-[var(--text-4)] px-1 py-3 text-center border border-dashed border-[var(--border-1)] rounded-lg">
                          {isTarget ? '여기에 놓기' : '비어 있음'}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 종료된 딜 — 파이프라인 합계에서 빠지되 기록은 남는다 */}
          {closedDeals.length > 0 ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
                className="flex items-center gap-2 min-h-[36px] text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
              >
                <span className="font-medium">종료된 딜 {closedDeals.length}건</span>
                <span className="text-[11px] text-[var(--text-4)]">
                  {showClosed ? '접기' : '펼치기'}
                </span>
              </button>
              {showClosed ? (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {closedDeals.map((c) => {
                    const status = dealStatusOf(c);
                    return (
                      <Link key={c.id} href={`/sales/clients/${c.id}`} className="block">
                        <Card interactive padding="sm" className="cursor-pointer">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 text-[13.5px] font-semibold text-[var(--text-1)] truncate">
                              {c.name}
                            </span>
                            <Badge tone={DEAL_STATUS_TONE[status] || 'neutral'} size="xs">
                              {DEAL_STATUS_LABEL[status] || status}
                            </Badge>
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--text-4)]">
                            {STAGE_LABEL[c.stage] || c.stage}
                            {c.closedAt ? ` · ${fmtDate(c.closedAt)} 종료` : ''}
                          </div>
                          {status === 'lost' && c.lostReason ? (
                            <div className="mt-1.5 text-[11.5px] text-[var(--danger-fg)] break-words">
                              사유 · {c.lostReason}
                            </div>
                          ) : null}
                          {status === 'won' && c.expectedRevenue ? (
                            <div className="mt-1.5 text-[11.5px] text-[var(--success-fg)] tabular">
                              {fmtKRW(c.expectedRevenue)}
                            </div>
                          ) : null}
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </AppLayout>
  );
}
