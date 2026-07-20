'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SalesJournal, SALES_STAGES, STAGE_LABEL, STAGE_TONE, fmtDate } from '@/lib/sales';
import { userShort, userLabelOrEmpty } from '@/lib/user';
import {
  PageHeader,
  Button,
  Badge,
  EmptyState,
  CenterSpinner,
  Card,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '@/components/ui';
import { cn } from '@/lib/cn';

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

// 표 보기 정렬 기준 — 작성자별로 모아 보려는 목적이 커서 작성자 정렬을 넣었다
type SortKey = 'meetingDate' | 'author' | 'client' | 'stage';

function sortJournals(list: SalesJournal[], key: SortKey, asc: boolean): SalesJournal[] {
  const val = (j: SalesJournal): string => {
    if (key === 'author') return userShort(j.author || null) || '';
    if (key === 'client') return (j.client as { name?: string } | undefined)?.name || '';
    if (key === 'stage') return String(SALES_STAGES.findIndex((s) => s.key === journalStage(j)));
    return j.meetingDate || '';
  };
  const sorted = [...list].sort((a, b) => val(a).localeCompare(val(b), 'ko'));
  return asc ? sorted : sorted.reverse();
}

export default function SalesJournalListPage() {
  const [journals, setJournals] = useState<SalesJournal[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // 보기 방식은 사람마다 취향이 갈려 브라우저에 기억시킨다
  const [view, setView] = useState<'board' | 'table'>('board');
  const [sortKey, setSortKey] = useState<SortKey>('meetingDate');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('salesJournalView');
    if (saved === 'table' || saved === 'board') setView(saved);
  }, []);

  const changeView = (v: 'board' | 'table') => {
    setView(v);
    localStorage.setItem('salesJournalView', v);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* 보기 전환 — 파이프라인(단계별 진행 파악용) / 표(작성자·거래처 비교용) */}
            <div className="inline-flex rounded-md border border-[var(--border-1)] overflow-hidden">
              {([
                ['board', '파이프라인'],
                ['table', '표'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeView(key)}
                  aria-pressed={view === key}
                  className={cn(
                    'px-3 py-1.5 min-h-[36px] text-[12.5px] transition-colors',
                    view === key
                      ? 'bg-[var(--bg-2)] text-[var(--text-1)]'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link href="/sales/new">
              <Button variant="primary" size="md">
                + 새 영업일지
              </Button>
            </Link>
          </div>
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
      ) : view === 'table' ? (
        <JournalTable
          journals={sortJournals(journals, sortKey, sortAsc)}
          sortKey={sortKey}
          sortAsc={sortAsc}
          onSort={toggleSort}
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

// 표 보기 — 작성자·거래처 기준으로 비교·정렬해서 보기 위한 목록
function JournalTable({
  journals,
  sortKey,
  sortAsc,
  onSort,
}: {
  journals: SalesJournal[];
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const arrow = (k: SortKey) => (sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : '');
  const SortTH = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <TH className={className}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="hover:text-[var(--text-1)] transition-colors"
      >
        {label}
        <span className="text-[var(--brand-400)]">{arrow(k)}</span>
      </button>
    </TH>
  );

  return (
    <>
      {/* 모바일: 표 대신 카드 — 컬럼이 6개라 좁은 화면에서 읽기 어렵다 */}
      <div className="sm:hidden space-y-2">
        {journals.map((j) => {
          const client = j.client as { name?: string } | undefined;
          const stage = journalStage(j);
          return (
            <Link key={j.id} href={`/sales/${j.id}`} className="block">
              <Card padding="md" className="hover-lift">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-[14px] font-medium text-[var(--brand-400)] break-words">
                    {j.title || '(제목 없음)'}
                  </span>
                  {j.passwordProtected && (
                    <span className="text-[11px] text-[var(--text-4)] shrink-0" title="열람 잠금">
                      🔒
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <Badge tone={STAGE_TONE[stage] || 'neutral'} size="xs">
                    {STAGE_LABEL[stage] || stage}
                  </Badge>
                  {j.isFirstMeeting && (
                    <Badge tone="info" size="xs">
                      최초
                    </Badge>
                  )}
                  {client?.name && (
                    <span className="text-[11.5px] text-[var(--text-3)] break-words">{client.name}</span>
                  )}
                </div>
                <p className="mt-2 text-[11.5px] text-[var(--text-4)] break-words">
                  작성 {userShort(j.author || null)} · 미팅 {fmtDate(j.meetingDate)}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <Table>
          <THead>
            <TR>
              <TH>제목</TH>
              <SortTH k="client" label="거래처" />
              <SortTH k="stage" label="단계" className="hidden md:table-cell" />
              <SortTH k="meetingDate" label="미팅일" />
              <SortTH k="author" label="작성자" />
              <TH className="hidden lg:table-cell" align="right">
                작성일
              </TH>
            </TR>
          </THead>
          <TBody>
            {journals.map((j) => {
              const client = j.client as { name?: string } | undefined;
              const stage = journalStage(j);
              return (
                <TR key={j.id}>
                  <TD emphasis>
                    <Link
                      href={`/sales/${j.id}`}
                      className="text-[var(--brand-400)] hover:text-[var(--brand-200)] font-medium transition-colors"
                    >
                      {j.title || '(제목 없음)'}
                    </Link>
                    {j.passwordProtected && (
                      <span className="ml-1.5 text-[11px] text-[var(--text-4)]" title="열람 잠금">
                        🔒
                      </span>
                    )}
                  </TD>
                  <TD muted>
                    <span className="block max-w-[180px] truncate">{client?.name || '—'}</span>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <Badge tone={STAGE_TONE[stage] || 'neutral'} size="xs">
                      {STAGE_LABEL[stage] || stage}
                    </Badge>
                  </TD>
                  <TD muted numeric>
                    {fmtDate(j.meetingDate)}
                  </TD>
                  <TD muted>
                    <span className="block max-w-[160px] truncate" title={userLabelOrEmpty(j.author)}>
                      {userShort(j.author || null)}
                    </span>
                  </TD>
                  <TD className="hidden lg:table-cell" align="right" muted numeric>
                    {fmtDate(j.createdAt)}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </>
  );
}
