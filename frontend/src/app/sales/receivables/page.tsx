'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { ReceivablesData, fmtKRW } from '@/lib/sales';
import { PageHeader, Card, Button, EmptyState, CenterSpinner } from '@/components/ui';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// clientId -> (month -> amount)
type Matrix = Record<string, Record<number, number>>;

function buildMatrix(data: ReceivablesData): Matrix {
  const m: Matrix = {};
  for (const row of data.rows) {
    m[row.clientId] = {};
    for (const mo of MONTHS) m[row.clientId][mo] = Number(row.months[String(mo)] || 0);
  }
  return m;
}

function parseNum(s: string): number {
  const n = Number(String(s).replace(/[^\d]/g, ''));
  return isNaN(n) ? 0 : n;
}

export default function ReceivablesPage() {
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [data, setData] = useState<ReceivablesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [saved, setSaved] = useState<Matrix>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const d: ReceivablesData = await api.sales.receivables(y);
      setData(d);
      const m = buildMatrix(d);
      setMatrix(m);
      // 저장본은 깊은 복사
      setSaved(JSON.parse(JSON.stringify(m)));
    } catch (e) {
      console.error('Failed to load receivables:', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(year);
  }, [year, load]);

  const setCell = (clientId: string, month: number, value: number) => {
    setMatrix((prev) => ({ ...prev, [clientId]: { ...prev[clientId], [month]: value } }));
  };

  const commit = async (clientId: string, month: number) => {
    const cur = matrix[clientId]?.[month] ?? 0;
    const was = saved[clientId]?.[month] ?? 0;
    if (cur === was) return;
    const cellKey = `${clientId}-${month}`;
    setSavingCell(cellKey);
    try {
      await api.sales.upsertReceivable({ clientId, year, month, amount: cur });
      setSaved((prev) => ({ ...prev, [clientId]: { ...prev[clientId], [month]: cur } }));
    } catch (e) {
      alert((e as Error)?.message || '저장에 실패했습니다.');
      // 실패 시 되돌림
      setCell(clientId, month, was);
    } finally {
      setSavingCell(null);
    }
  };

  // 합계(라이브: matrix 기준)
  const { rowTotals, monthTotals, grandTotal } = useMemo(() => {
    const rowTotals: Record<string, number> = {};
    const monthTotals: Record<number, number> = {};
    for (const mo of MONTHS) monthTotals[mo] = 0;
    let grand = 0;
    for (const cid of Object.keys(matrix)) {
      let rt = 0;
      for (const mo of MONTHS) {
        const v = matrix[cid]?.[mo] ?? 0;
        rt += v;
        monthTotals[mo] += v;
      }
      rowTotals[cid] = rt;
      grand += rt;
    }
    return { rowTotals, monthTotals, grandTotal: grand };
  }, [matrix]);

  const stickyBg = { background: 'var(--bg-1)' };
  const stickyHeadBg = { background: 'var(--bg-2)' };

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Accounts Receivable"
        title="매출채권 잔액"
        description="거래처별 월별 매출채권 잔액을 관리합니다. (B2B 채권 관리)"
        actions={
          <div className="flex items-center rounded-md border border-[var(--border-2)] overflow-hidden">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="px-2.5 h-9 text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
              aria-label="이전 연도"
            >
              ‹
            </button>
            <span className="px-3 h-9 inline-flex items-center text-[13px] font-semibold text-[var(--text-1)] tabular border-x border-[var(--border-2)]">
              {year}년
            </span>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="px-2.5 h-9 text-[var(--text-2)] hover:bg-[var(--bg-2)] transition-colors"
              aria-label="다음 연도"
            >
              ›
            </button>
          </div>
        }
      />

      {loading ? (
        <CenterSpinner label="매출채권 불러오는 중" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title="등록된 거래처가 없습니다"
          description="매출채권을 기입하려면 먼저 거래처를 등록하세요."
          action={
            <Link href="/sales/clients/new">
              <Button variant="primary" size="md">
                + 거래처 등록
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-3)]">
            <span>
              {year}년 총 매출채권 잔액 합계{' '}
              <span className="text-[var(--brand-400)] font-semibold tabular">{fmtKRW(grandTotal)}</span>
            </span>
            <span className="text-[var(--text-4)] hidden sm:inline">·</span>
            <span>거래처 {data.rows.length}곳</span>
          </div>
          {/* 12개월 매트릭스는 카드로 접기 어려워 가로 스크롤 + 거래처명 고정으로 처리 */}
          <p className="sm:hidden text-[11.5px] text-[var(--text-4)] mb-2">
            좌우로 밀어서 각 월을 확인하세요. 거래처명은 왼쪽에 고정됩니다 →
          </p>
          <Card padding="none" className="overflow-hidden">
            <div className="touch-scroll-x">
              <table className="border-collapse text-[12.5px] min-w-max">
                <thead>
                  <tr>
                    <th
                      className="sticky left-0 z-10 text-left px-3 py-2 font-medium text-[var(--text-2)] border-b border-r border-[var(--border-1)] whitespace-nowrap"
                      style={stickyHeadBg}
                    >
                      거래처
                    </th>
                    {MONTHS.map((mo) => (
                      <th
                        key={mo}
                        className="px-2 py-2 font-medium text-[var(--text-3)] text-right border-b border-[var(--border-1)] whitespace-nowrap"
                      >
                        {mo}월
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium text-[var(--text-2)] text-right border-b border-l border-[var(--border-1)] whitespace-nowrap">
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.clientId} className="hover:bg-[var(--bg-2)]/40">
                      <td
                        className="sticky left-0 z-10 px-3 py-1.5 border-b border-r border-[var(--border-1)] whitespace-nowrap"
                        style={stickyBg}
                      >
                        <Link
                          href={`/sales/clients/${row.clientId}`}
                          className="block max-w-[120px] sm:max-w-none truncate text-[var(--brand-400)] hover:text-[var(--brand-200)] font-medium transition-colors"
                          title={row.name}
                        >
                          {row.name}
                        </Link>
                      </td>
                      {MONTHS.map((mo) => {
                        const v = matrix[row.clientId]?.[mo] ?? 0;
                        const cellKey = `${row.clientId}-${mo}`;
                        return (
                          <td key={mo} className="px-1 py-1 border-b border-[var(--border-1)] text-right">
                            <input
                              inputMode="numeric"
                              value={v > 0 ? v.toLocaleString() : ''}
                              onChange={(e) => setCell(row.clientId, mo, parseNum(e.target.value))}
                              onBlur={() => commit(row.clientId, mo)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              placeholder="0"
                              className={
                                'w-[92px] text-right tabular bg-transparent rounded px-1.5 py-1 text-[var(--text-1)] ' +
                                'border border-transparent hover:border-[var(--border-2)] ' +
                                'focus:outline-none focus:border-[var(--brand-500)] transition-colors ' +
                                (savingCell === cellKey ? 'opacity-60' : '')
                              }
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 border-b border-l border-[var(--border-1)] text-right text-[var(--text-1)] tabular whitespace-nowrap">
                        {rowTotals[row.clientId] ? fmtKRW(rowTotals[row.clientId]) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      className="sticky left-0 z-10 px-3 py-2 font-semibold text-[var(--text-2)] border-t border-r border-[var(--border-1)] whitespace-nowrap"
                      style={stickyHeadBg}
                    >
                      월별 합계
                    </td>
                    {MONTHS.map((mo) => (
                      <td
                        key={mo}
                        className="px-2 py-2 text-right text-[var(--text-3)] tabular border-t border-[var(--border-1)] whitespace-nowrap"
                      >
                        {monthTotals[mo] ? fmtKRW(monthTotals[mo]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold text-[var(--brand-400)] tabular border-t border-l border-[var(--border-1)] whitespace-nowrap">
                      {fmtKRW(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          <p className="mt-3 text-[11.5px] text-[var(--text-4)]">
            셀을 클릭해 금액을 입력하고 다른 곳을 클릭(또는 Enter)하면 자동 저장됩니다. 단위: 원(₩).
          </p>
        </>
      )}
    </AppLayout>
  );
}
