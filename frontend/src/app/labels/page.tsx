'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { HealthClaim, getClaimBadgeColor } from '@/lib/healthClaims';
import { userLabel } from '@/lib/user';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Field,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  StatusPill,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

interface Label {
  id: string;
  productName: string;
  productType: string | null;
  salesChannel: string | null;
  status: string;
  healthClaims: HealthClaim[] | null;
  designFileUrl: string | null;
  designFileName: string | null;
  manufacturingReportUrl: string | null;
  manufacturingReportName: string | null;
  manufacturingReportMaskedUrl: string | null;
  manufacturingReportMaskingLocked: boolean | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    department: string | null;
  };
  reviewCategories: Array<{
    items: Array<{ isCompleted: boolean }>;
  }>;
}

export default function DashboardPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const fetchLabels = async (page = 1) => {
    try {
      setLoading(true);
      const data = await api.labels.list({
        page,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setLabels(data.labels);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch labels:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLabels(1);
  };

  const getReviewProgress = (label: Label) => {
    const allItems = label.reviewCategories.flatMap((c) => c.items);
    if (allItems.length === 0) return 0;
    return Math.round((allItems.filter((i) => i.isCompleted).length / allItems.length) * 100);
  };

  // 상단 KPI
  const totalCount = pagination.total;
  const inReviewCount = labels.filter((l) => l.status === 'in_review').length;
  const approvedCount = labels.filter((l) => l.status === 'approved').length;
  const draftCount = labels.filter((l) => l.status === 'draft').length;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Labeling Operations"
        title="표기사항 관리"
        description="식품 표기사항·법령 검토 워크플로우를 한 곳에서 관리합니다."
        actions={
          <Link href="/labels/new">
            <Button variant="primary" size="md">
              + 새 라벨 작성
            </Button>
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-3)]">전체</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{totalCount}</div>
        </Card>
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-3)]">초안</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{draftCount}</div>
        </Card>
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--warning-fg)]">검토 중</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{inReviewCount}</div>
        </Card>
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--success-fg)]">승인</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{approvedCount}</div>
        </Card>
      </div>

      {/* 검색·필터 */}
      <Card padding="md" className="mb-5">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <Field className="flex-1">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제품명으로 검색…"
              inputSize="md"
            />
          </Field>
          <Field className="sm:w-44">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              inputSize="md"
            >
              <option value="">전체 상태</option>
              <option value="draft">초안</option>
              <option value="in_review">검토 중</option>
              <option value="approved">승인 완료</option>
            </Select>
          </Field>
          <Button type="submit" variant="secondary" size="md">
            검색
          </Button>
        </form>
      </Card>

      {/* 라벨 목록 */}
      {loading ? (
        <CenterSpinner label="라벨 목록 불러오는 중" />
      ) : labels.length === 0 ? (
        <EmptyState
          title="등록된 표기사항이 없습니다"
          description="첫 라벨을 만들어 영양성분·원재료·검토 워크플로를 시작하세요."
          action={
            <Link href="/labels/new">
              <Button variant="primary" size="md">
                + 첫 라벨 작성하기
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* 모바일: 표 대신 카드 목록 — 좁은 화면에서 숨겨지던 강조 표기·첨부·진행률까지 보여준다 */}
          <div className="sm:hidden space-y-2">
            {labels.map((label) => {
              const progress = getReviewProgress(label);
              const claims = (label.healthClaims as HealthClaim[]) || [];
              const eligibleClaims = claims.filter((c) => c.eligible);

              return (
                <Link key={label.id} href={`/labels/${label.id}`} className="block">
                  <Card padding="md" className="hover-lift">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[14px] font-medium text-[var(--brand-400)] break-words">
                          {label.productName}
                        </span>
                        {label.productType && (
                          <p className="text-[11px] text-[var(--text-4)] mt-0.5">{label.productType}</p>
                        )}
                      </div>
                      <span className="shrink-0">
                        <StatusPill status={label.status} />
                      </span>
                    </div>

                    {eligibleClaims.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {eligibleClaims.slice(0, 3).map((c) => (
                          <span
                            key={c.id}
                            className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-bold ${getClaimBadgeColor(
                              c,
                            )}`}
                          >
                            {c.name}
                          </span>
                        ))}
                        {eligibleClaims.length > 3 && (
                          <Badge tone="neutral" size="xs">
                            +{eligibleClaims.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {label.designFileUrl ? (
                        <Badge tone="violet" size="xs">
                          디자인 {label.designFileName?.endsWith('.pdf') ? 'PDF' : 'IMG'}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-[var(--text-4)]">디자인 미첨부</span>
                      )}
                      {label.manufacturingReportUrl ? (
                        <>
                          <Badge tone="info" size="xs">
                            품목제조보고
                          </Badge>
                          {label.manufacturingReportMaskingLocked ? (
                            <Badge tone="success" size="xs">
                              마스킹
                            </Badge>
                          ) : label.manufacturingReportMaskedUrl ? (
                            <Badge tone="warning" size="xs">
                              자동
                            </Badge>
                          ) : (
                            <Badge tone="warning" size="xs">
                              미마스킹
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-[var(--text-4)]">보고서 미첨부</span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--brand-500)] transition-all duration-base ease-out-soft"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[11.5px] text-[var(--text-3)] tabular w-9 text-right shrink-0">
                        {progress}%
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] text-[var(--text-4)] break-words">
                      {userLabel(label.createdBy)} ·{' '}
                      {new Date(label.createdAt).toLocaleDateString('ko-KR')}
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
                <TH>제품명</TH>
                <TH className="hidden sm:table-cell">강조 표기</TH>
                <TH>상태</TH>
                <TH className="hidden sm:table-cell">디자인</TH>
                <TH className="hidden sm:table-cell">품목제조보고</TH>
                <TH className="hidden md:table-cell">검토 진행률</TH>
                <TH className="hidden md:table-cell">작성자</TH>
                <TH align="right">작성일</TH>
              </TR>
            </THead>
            <TBody>
              {labels.map((label) => {
                const progress = getReviewProgress(label);
                const claims = (label.healthClaims as HealthClaim[]) || [];
                const eligibleClaims = claims.filter((c) => c.eligible);

                return (
                  <TR key={label.id}>
                    <TD emphasis>
                      <Link
                        href={`/labels/${label.id}`}
                        className="text-[var(--brand-400)] hover:text-[var(--brand-200)] font-medium transition-colors"
                      >
                        {label.productName}
                      </Link>
                      {label.productType && (
                        <p className="text-[11px] text-[var(--text-4)] mt-0.5">{label.productType}</p>
                      )}
                    </TD>
                    <TD className="hidden sm:table-cell">
                      {eligibleClaims.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {eligibleClaims.slice(0, 3).map((c) => (
                            <span
                              key={c.id}
                              className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-bold ${getClaimBadgeColor(
                                c,
                              )}`}
                            >
                              {c.name}
                            </span>
                          ))}
                          {eligibleClaims.length > 3 && (
                            <Badge tone="neutral" size="xs">
                              +{eligibleClaims.length - 3}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-4)]">—</span>
                      )}
                    </TD>
                    <TD>
                      <StatusPill status={label.status} />
                    </TD>
                    <TD className="hidden sm:table-cell">
                      {label.designFileUrl ? (
                        <Link
                          href={`/labels/${label.id}`}
                          className="inline-flex"
                          aria-label="디자인 파일 첨부됨"
                        >
                          <Badge tone="violet" size="sm">
                            {label.designFileName?.endsWith('.pdf') ? 'PDF' : 'IMG'} 첨부
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-[11px] text-[var(--text-4)]">미첨부</span>
                      )}
                    </TD>
                    <TD className="hidden sm:table-cell">
                      {label.manufacturingReportUrl ? (
                        <Link
                          href={`/labels/${label.id}`}
                          className="inline-flex items-center gap-1.5"
                          aria-label="품목제조보고서 첨부됨"
                        >
                          <Badge tone="info" size="sm">
                            PDF 첨부
                          </Badge>
                          {label.manufacturingReportMaskingLocked ? (
                            <Badge
                              tone="success"
                              size="xs"
                              title="배합비율 마스킹 영구 적용됨"
                            >
                              마스킹
                            </Badge>
                          ) : label.manufacturingReportMaskedUrl ? (
                            <Badge
                              tone="warning"
                              size="xs"
                              title="자동 마스킹 적용 (수동 확인 권장)"
                            >
                              자동
                            </Badge>
                          ) : (
                            <Badge
                              tone="warning"
                              size="xs"
                              title="배합비 마스킹 미적용"
                            >
                              미마스킹
                            </Badge>
                          )}
                        </Link>
                      ) : (
                        <span className="text-[11px] text-[var(--text-4)]">미첨부</span>
                      )}
                    </TD>
                    <TD className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--brand-500)] transition-all duration-base ease-out-soft"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[11.5px] text-[var(--text-3)] tabular w-9 text-right">
                          {progress}%
                        </span>
                      </div>
                    </TD>
                    <TD className="hidden md:table-cell" muted>
                      {/* 이름(이메일)은 길어질 수 있어 열 너비를 지키고 전체는 툴팁으로 */}
                      <span className="block max-w-[220px] truncate" title={userLabel(label.createdBy)}>
                        {userLabel(label.createdBy)}
                      </span>
                    </TD>
                    <TD align="right" muted numeric>
                      {new Date(label.createdAt).toLocaleDateString('ko-KR')}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          </div>

          {/* 페이지네이션 — 페이지 수가 많아도 모바일에서 줄바꿈되도록 */}
          {pagination.totalPages > 1 && (
            <div className="flex flex-wrap justify-center mt-5 gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => fetchLabels(page)}
                  className={
                    page === pagination.page
                      ? 'min-w-[36px] px-2.5 py-2 sm:py-1 rounded-md text-[12.5px] bg-[var(--brand-500)] text-white tabular'
                      : 'min-w-[36px] px-2.5 py-2 sm:py-1 rounded-md text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] tabular'
                  }
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
