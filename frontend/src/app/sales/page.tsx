'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SalesJournal, STAGE_LABEL, STAGE_TONE, fmtDate } from '@/lib/sales';
import {
  PageHeader,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

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

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Journal"
        title="영업일지"
        description="영업담당자별 영업일지 · 작성자와 참고자, 최고관리자만 열람할 수 있습니다."
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
        <Table>
          <THead>
            <TR>
              <TH>제목</TH>
              <TH>거래처</TH>
              <TH className="hidden sm:table-cell">담당자</TH>
              <TH>미팅일</TH>
              <TH className="hidden md:table-cell">단계</TH>
              <TH align="right">상태</TH>
            </TR>
          </THead>
          <TBody>
            {journals.map((j) => {
              const client = j.client as { id?: string; name?: string } | undefined;
              const author = j.author;
              return (
                <TR key={j.id}>
                  <TD emphasis>
                    <Link
                      href={`/sales/${j.id}`}
                      className="text-[var(--brand-400)] hover:text-[var(--brand-200)] font-medium transition-colors"
                    >
                      {j.title || '(제목 없음)'}
                    </Link>
                  </TD>
                  <TD muted>{client?.name || '—'}</TD>
                  <TD className="hidden sm:table-cell" muted>
                    {author?.name || author?.email || '—'}
                  </TD>
                  <TD muted numeric>
                    {fmtDate(j.meetingDate)}
                  </TD>
                  <TD className="hidden md:table-cell">
                    {j.stage ? (
                      <Badge tone={STAGE_TONE[j.stage] || 'neutral'} size="xs">
                        {STAGE_LABEL[j.stage] || j.stage}
                      </Badge>
                    ) : (
                      <span className="text-[var(--text-4)]">—</span>
                    )}
                  </TD>
                  <TD align="right">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      {j.isFirstMeeting && (
                        <Badge tone="info" size="xs">
                          최초미팅
                        </Badge>
                      )}
                      {j.passwordProtected && (
                        <Badge tone="neutral" size="xs">
                          🔒 잠금
                        </Badge>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </AppLayout>
  );
}
