'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SalesClient, SALES_STAGES, fmtKRW, weightedRevenue } from '@/lib/sales';
import {
  PageHeader,
  Card,
  Button,
  Select,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

export default function SalesClientsPage() {
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.sales.listClients();
      setClients(data.clients);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moveStage = async (id: string, stage: string) => {
    try {
      await api.sales.updateClient(id, { stage });
      await load();
    } catch (error) {
      console.error('Failed to move stage:', error);
    }
  };

  const byStage = (stageKey: string) => clients.filter((c) => c.stage === stageKey);

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Pipeline"
        title="거래처"
        description="영업 단계별 거래처 파이프라인을 관리합니다."
        actions={
          <Link href="/sales/clients/new">
            <Button variant="primary" size="md">
              + 거래처 등록
            </Button>
          </Link>
        }
      />

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
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {SALES_STAGES.map((stage) => {
              const list = byStage(stage.key);
              const stageWeighted = list.reduce((sum, c) => sum + weightedRevenue(c), 0);
              return (
                <div key={stage.key} className="w-[264px] flex-shrink-0">
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
                  <div className="flex flex-col gap-2">
                    {list.map((c) => {
                      const primary = c.contacts && c.contacts[0];
                      return (
                        <div key={c.id} className="relative group">
                          <Link href={`/sales/clients/${c.id}`}>
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
                              <div className="flex items-center gap-2 mt-2 text-[11px] text-[var(--text-4)] tabular">
                                <span>일지 {c._count?.journals ?? 0}</span>
                                <span className="text-[var(--border-3)]">·</span>
                                <span>계획 {c._count?.plans ?? 0}</span>
                              </div>
                            </Card>
                          </Link>
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
                        비어 있음
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
