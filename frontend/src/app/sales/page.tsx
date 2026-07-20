'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SalesJournal, SALES_STAGES, fmtDate } from '@/lib/sales';
import { userShort, userLabelOrEmpty } from '@/lib/user';
import { PageHeader, Button, Badge, EmptyState, CenterSpinner } from '@/components/ui';

// 단계별 상단 수평선 색상 (파이프라인 컬럼 헤더)
const STAGE_LINE: Record<string, string> = {
  lead: 'var(--text-3)',
  contact: 'var(--info-fg)',
  proposal: 'var(--brand-400)',
  revenue: 'var(--success-fg)',
  expansion: '#C084FC',
};

function journalStage(j: SalesJournal): string {
  const clientStage = (j.client as { stage?: string } | undefined)?.stage;
  return j.stage || clientStage || 'lead';
}

export default function SalesJournalListPage() {
  const [journals, setJournals] = useState<SalesJournal[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.listJournals();
        setJournals(data.journals);
        setIsSuperAdmin(!!data.isSuperAdmin);
      } catch (e) {
        console.error('Failed to load journals:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byStage = (stageKey: string) => journals.filter((j) => journalStage(j) === stageKey);

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Journal"
        title="영업일지"
        description="영업 단계별로 정리된 영업일지 파이프라인. 작성자·참고자·최고관리자만 열람할 수 있습니다."
        actions={
          <Link href="/sales/new">
            <Button variant="primary" size="md">
              + 새 영업일지
            </Button>
          </Link>
        }
      />

      {isSuperAdmin && (
        <div className="mb-4">
          <Badge tone="violet" size="sm">
            전체 열람 권한 (최고관리자)
          </Badge>
        </div>
      )}

      {loading ? (
        <CenterSpinner label="영업일지 불러오는 중" />
      ) : journals.length === 0 ? (
        <EmptyState
          title="등록된 영업일지가 없습니다"
          description="거래처와의 미팅·핵심 요청사항·향후 스케쥴을 영업일지로 기록하세요."
          action={
            <Link href="/sales/new">
              <Button variant="primary" size="md">
                + 첫 영업일지 작성
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* 모바일에서는 단계 컬럼이 화면을 넘어가므로 스크롤 가능함을 알린다 */}
          <p className="sm:hidden text-[11.5px] text-[var(--text-4)] mb-2">
            좌우로 밀어서 다른 영업 단계를 볼 수 있습니다 →
          </p>
          <div className="touch-scroll-x pb-2">
            <div className="flex gap-3 min-w-max">
            {SALES_STAGES.map((stage) => {
              const list = byStage(stage.key);
              const line = STAGE_LINE[stage.key] || 'var(--text-3)';
              return (
                <div key={stage.key} className="w-[80vw] max-w-[288px] sm:w-[288px] flex-shrink-0">
                  {/* 단계 헤더 + 상단 수평 직선 */}
                  <div className="pt-2" style={{ borderTop: `2px solid ${line}` }}>
                    <div className="flex items-center justify-between px-1 pt-1.5 pb-2">
                      <span className="text-[12.5px] font-semibold text-[var(--text-1)]">
                        {stage.label}
                      </span>
                      <span className="text-[11px] tabular text-[var(--text-4)] bg-[var(--bg-2)] rounded-full px-2 py-0.5">
                        {list.length}
                      </span>
                    </div>
                  </div>

                  {/* 단계별 메모 카드 스택 */}
                  <div className="flex flex-col gap-2">
                    {list.map((j) => {
                      const client = j.client as { name?: string } | undefined;
                      const author = j.author;
                      return (
                        <Link key={j.id} href={`/sales/${j.id}`}>
                          <div
                            className="rounded-md border border-[var(--border-1)] bg-[var(--bg-1)] p-2.5 hover-lift cursor-pointer"
                            style={{ borderLeft: `3px solid ${line}` }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-[13px] font-medium text-[var(--text-1)] leading-snug line-clamp-2">
                                {j.title || '(제목 없음)'}
                              </span>
                              {j.passwordProtected && (
                                <span className="text-[11px] text-[var(--text-4)] flex-shrink-0" title="열람 잠금">
                                  🔒
                                </span>
                              )}
                            </div>
                            {client?.name && (
                              <div className="text-[11.5px] text-[var(--text-3)] mt-1 truncate">
                                {client.name}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <span className="text-[11px] text-[var(--text-4)] tabular">
                                {fmtDate(j.meetingDate)}
                              </span>
                              <div className="flex items-center gap-1">
                                {j.isFirstMeeting && (
                                  <Badge tone="info" size="xs">
                                    최초
                                  </Badge>
                                )}
                                <span
                                  className="text-[11px] text-[var(--text-4)] truncate max-w-[90px]"
                                  title={userLabelOrEmpty(author)}
                                >
                                  {author ? userShort(author) : ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {list.length === 0 && (
                      <div className="text-[11.5px] text-[var(--text-4)] px-1 py-4 text-center border border-dashed border-[var(--border-1)] rounded-md">
                        해당 단계 일지 없음
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
