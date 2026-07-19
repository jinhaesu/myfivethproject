'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, getFileUrl } from '@/lib/api';
import { SalesJournal, SalesClient, STAGE_LABEL, STAGE_TONE, fmtDate } from '@/lib/sales';
import { Card, CardHeader, Button, Badge, CenterSpinner } from '@/components/ui';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 py-2 border-b border-[var(--border-1)] last:border-0">
      <div className="text-[12.5px] text-[var(--text-3)]">{label}</div>
      <div className="text-[13px] text-[var(--text-1)] whitespace-pre-wrap break-words">
        {value || <span className="text-[var(--text-4)]">—</span>}
      </div>
    </div>
  );
}

export default function SharedJournalPage() {
  const params = useParams();
  const token = String(params?.token || '');

  const [journal, setJournal] = useState<SalesJournal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.sales.publicJournal(token);
      setJournal(data.journal);
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(
        err.status === 404
          ? '공유가 해제되었거나 존재하지 않는 링크입니다.'
          : err.message || '영업일지를 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const client = journal?.client as SalesClient | undefined;
  const attachments = journal?.attachments || [];
  const proposals = attachments.filter((a) => a.kind !== 'card');
  const cards = attachments.filter((a) => a.kind === 'card');

  return (
    <div className="min-h-screen bg-[var(--bg-0)]">
      {/* 외부 공유용 헤더 (로그인 없이 열람) */}
      <header className="sticky top-0 z-30 bg-[rgba(11,12,13,0.85)] backdrop-blur-md border-b border-[var(--border-1)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-12 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block w-1.5 h-5 rounded-sm bg-[var(--brand-500)] flex-shrink-0" />
              <span className="text-[13px] font-semibold tracking-tight text-[var(--text-1)] truncate">
                조인앤조인 · 영업일지
              </span>
            </div>
            {journal && (
              <a href={api.sales.publicJournalWordUrl(token)} className="flex-shrink-0">
                <Button variant="secondary" size="sm">
                  Word 다운로드
                </Button>
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <CenterSpinner label="영업일지 불러오는 중" />
        ) : error || !journal ? (
          <Card padding="lg" className="mt-10 text-center">
            <div className="text-[15px] font-semibold text-[var(--text-1)]">열람할 수 없습니다</div>
            <p className="text-[13px] text-[var(--text-3)] mt-2">{error}</p>
            <p className="text-[12px] text-[var(--text-4)] mt-3">
              링크를 보내준 담당자에게 새 공유 링크를 요청해주세요.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            {/* 문서 헤더 */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-4)]">
                Shared Sales Journal
              </div>
              <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-1)] mt-1">
                {journal.title || '영업일지'}
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {client?.name && (
                  <Badge tone="neutral" size="sm">
                    {client.name}
                  </Badge>
                )}
                {journal.stage && (
                  <Badge tone={STAGE_TONE[journal.stage] || 'neutral'} size="sm">
                    {STAGE_LABEL[journal.stage] || journal.stage}
                  </Badge>
                )}
                {journal.isFirstMeeting && (
                  <Badge tone="info" size="sm">
                    최초 미팅
                  </Badge>
                )}
                <span className="text-[12.5px] text-[var(--text-3)] ml-1">
                  미팅 {fmtDate(journal.meetingDate)}
                </span>
              </div>
            </div>

            <Card padding="lg">
              <CardHeader title="미팅 정보" />
              <Row label="미팅 일자" value={fmtDate(journal.meetingDate)} />
              <Row label="미팅 목적" value={journal.meetingPurpose} />
              <Row label="장소" value={journal.meetingLocation} />
              <Row label="참석자" value={journal.attendees} />
              <Row label="미팅 개요" value={journal.meetingSummary} />
            </Card>

            <Card padding="lg">
              <CardHeader title="요청 · 기획 사항" />
              <Row label="핵심 요청사항" value={journal.keyRequests} />
              <Row label="제품 요청/기획" value={journal.productRequests} />
            </Card>

            <Card padding="lg">
              <CardHeader title="견적 · 샘플" />
              <Row
                label="샘플 제공"
                value={
                  journal.sampleProvided ? (
                    <Badge tone="success" size="sm">제공함</Badge>
                  ) : (
                    <span className="text-[var(--text-4)]">미제공</span>
                  )
                }
              />
              {journal.quoteItems && journal.quoteItems.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-[12.5px] border-collapse min-w-[520px]">
                    <thead>
                      <tr className="text-left text-[var(--text-3)]">
                        <th className="py-1.5 pr-3 font-medium">제품명</th>
                        <th className="py-1.5 pr-3 font-medium">중량</th>
                        <th className="py-1.5 pr-3 font-medium">USP</th>
                        <th className="py-1.5 pr-3 font-medium">맛</th>
                        <th className="py-1.5 pr-3 font-medium">제안가격</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.quoteItems.map((q, i) => (
                        <tr key={q.id || i} className="border-t border-[var(--border-1)]">
                          <td className="py-1.5 pr-3 text-[var(--text-1)] font-medium">{q.productName}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-2)]">{q.weightSpec || '—'}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-2)]">{q.usp || '—'}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-2)]">{q.flavor || '—'}</td>
                          <td className="py-1.5 pr-3 text-[var(--text-1)] tabular">{q.price || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : journal.hasQuote ? (
                <p className="text-[12.5px] text-[var(--text-4)] mt-2">견적 제안 있음 (세부 항목 미기재)</p>
              ) : (
                <p className="text-[12.5px] text-[var(--text-4)] mt-2">견적 제안 없음</p>
              )}
            </Card>

            {journal.isFirstMeeting && client && (
              <Card padding="lg">
                <CardHeader title="거래처 정보" subtitle="최초 미팅 시 파악한 거래처 기본 정보입니다." />
                <Row label="담당 조직" value={client.ownerOrg} />
                <Row label="바이어 구성" value={client.buyerComposition} />
                <Row label="바이어·거래처 연매출" value={client.annualRevenue} />
                <Row label="기존 거래처" value={client.existingVendors} />
                <Row label="관리 품목" value={client.managedItems} />
                <Row label="보관 조건" value={client.storageCondition} />
                <Row label="물류 조건" value={client.logisticsCondition} />
              </Card>
            )}

            <Card padding="lg">
              <CardHeader title="향후 스케쥴 (해야 할 일)" />
              {journal.todos && journal.todos.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {journal.todos.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 py-2 border-b border-[var(--border-1)] last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={t.isDone}
                        disabled
                        readOnly
                        className="mt-0.5 w-4 h-4 accent-[var(--brand-500)] opacity-50"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge tone={t.isDone ? 'success' : 'warning'} size="xs">
                            {fmtDate(t.dueDate)}
                          </Badge>
                          <span
                            className={`text-[13px] ${t.isDone ? 'line-through text-[var(--text-4)]' : 'text-[var(--text-1)]'}`}
                          >
                            {t.content}
                          </span>
                          <span className="text-[11.5px] text-[var(--text-4)]">
                            {t.isDone ? '완료' : '진행 중'}
                          </span>
                        </div>
                        {t.plan && <div className="text-[12px] text-[var(--text-3)] mt-0.5">{t.plan}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-[var(--text-4)]">등록된 향후 스케쥴이 없습니다.</span>
              )}
            </Card>

            {(proposals.length > 0 || cards.length > 0) && (
              <Card padding="lg">
                <CardHeader title="첨부" subtitle="제안서 파일 · 거래처 명함" />

                <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-2">제안서 파일</div>
                {proposals.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {proposals.map((a) => (
                      <a
                        key={a.id}
                        href={getFileUrl(a.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-[12.5px] bg-[var(--bg-1)] border border-[var(--border-1)] rounded px-2.5 py-1.5 text-[var(--brand-400)] hover:text-[var(--brand-200)] transition-colors"
                      >
                        <span className="truncate">📄 {a.fileName}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-[var(--text-4)]">첨부된 제안서가 없습니다.</p>
                )}

                {cards.length > 0 && (
                  <>
                    <div className="text-[12.5px] font-medium text-[var(--text-2)] mt-4 mb-2">거래처 명함</div>
                    <div className="flex flex-wrap gap-2">
                      {cards.map((a) => (
                        <a key={a.id} href={getFileUrl(a.fileUrl)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getFileUrl(a.fileUrl)}
                            alt={a.fileName}
                            className="w-28 h-20 object-cover rounded border border-[var(--border-1)]"
                          />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            )}

            {/* 푸터 */}
            <div className="pt-1 pb-8 border-t border-[var(--border-1)] mt-1">
              <div className="text-[12.5px] text-[var(--text-2)] pt-4">
                작성자 {journal.authorName || '—'}
              </div>
              <p className="text-[11.5px] text-[var(--text-4)] mt-1.5 leading-relaxed">
                이 문서는 조인앤조인 영업일지에서 외부 공유용으로 생성된 읽기 전용 링크입니다.
                내용 수정은 사내 시스템에서만 가능하며, 링크는 공유 해제 시 즉시 만료됩니다.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
