'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { LaunchProject, getDday } from '@/lib/launch';
import { userLabel, userShort } from '@/lib/user';
import {
  PageHeader,
  Card,
  Button,
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

function DdayBadge({ targetLaunchDate }: { targetLaunchDate: string | null }) {
  const dday = getDday(targetLaunchDate);
  if (dday === null) return <span className="text-[11px] text-[var(--text-4)]">미정</span>;
  const label = dday === 0 ? 'D-DAY' : dday > 0 ? `D-${dday}` : `D+${-dday}`;
  const tone = dday < 0 ? 'neutral' : dday <= 7 ? 'danger' : dday <= 30 ? 'warning' : 'info';
  return (
    <Badge tone={tone} size="sm">
      {label}
    </Badge>
  );
}

export default function LaunchesPage() {
  const [projects, setProjects] = useState<LaunchProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.launches.list('launch');
        setProjects(data.projects);
      } catch (error) {
        console.error('Failed to fetch launch projects:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getProgress = (p: LaunchProject) => {
    const all = p.stages.flatMap((s) => s.tasks);
    if (all.length === 0) return 0;
    return Math.round((all.filter((t) => t.isCompleted).length / all.length) * 100);
  };

  const getCurrentStage = (p: LaunchProject) => {
    const active = p.stages.find((s) => s.status === 'in_progress');
    if (active) return active.name;
    if (p.status === 'completed') return '출시 완료';
    const firstPending = p.stages.find((s) => s.status === 'pending');
    return firstPending ? `${firstPending.name} (대기)` : '—';
  };

  const inProgressCount = projects.filter((p) => p.status === 'in_progress').length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const imminentCount = projects.filter((p) => {
    const d = getDday(p.targetLaunchDate);
    return d !== null && d >= 0 && d <= 7 && p.status !== 'completed';
  }).length;

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Launch Operations"
        title="신제품 출시 관리"
        description="제과·제빵 신제품의 출시 단계별 업무·체크리스트·알림을 관리합니다."
        actions={
          <Link href="/launches/new">
            <Button variant="primary" size="md">
              + 새 출시 프로젝트
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-3)]">전체</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{projects.length}</div>
        </Card>
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--info-fg)]">진행 중</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{inProgressCount}</div>
        </Card>
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--danger-fg)]">출시 임박 (D-7)</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{imminentCount}</div>
        </Card>
        <Card padding="md" className="hover-lift">
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--success-fg)]">출시 완료</div>
          <div className="mt-1 text-[22px] font-semibold tabular text-[var(--text-1)]">{completedCount}</div>
        </Card>
      </div>

      {loading ? (
        <CenterSpinner label="출시 프로젝트 불러오는 중" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="등록된 출시 프로젝트가 없습니다"
          description="신제품 출시 단계별 업무·체크리스트가 제과·제빵 템플릿으로 자동 생성됩니다."
          action={
            <Link href="/launches/new">
              <Button variant="primary" size="md">
                + 첫 출시 프로젝트 만들기
              </Button>
            </Link>
          }
        />
      ) : (
        <>
        {/* 모바일: 표 대신 카드 목록 — 좁은 화면에서 숨겨지던 현재 단계·진행률까지 함께 보여준다 */}
        <div className="sm:hidden space-y-2">
          {projects.map((p) => {
            const progress = getProgress(p);
            return (
              <Link key={p.id} href={`/launches/${p.id}`} className="block">
                <Card padding="md" className="hover-lift">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[14px] font-medium text-[var(--brand-400)] break-words">
                      {p.productName}
                    </span>
                    <span className="shrink-0">
                      <StatusPill status={p.status} />
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <DdayBadge targetLaunchDate={p.targetLaunchDate} />
                    {p.targetLaunchDate && (
                      <span className="text-[11.5px] text-[var(--text-3)] tabular">
                        {new Date(p.targetLaunchDate).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                    {p.brandType && (
                      <Badge tone="violet" size="xs">
                        {p.brandType}
                      </Badge>
                    )}
                    {p.storageCondition && (
                      <Badge tone="info" size="xs">
                        {p.storageCondition}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-[12px] text-[var(--text-3)] break-words">
                    {getCurrentStage(p)}
                  </p>

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

                  <p className="mt-2 text-[11.5px] text-[var(--text-4)] break-words">
                    등록 {userShort(p.createdBy)} · {new Date(p.createdAt).toLocaleDateString('ko-KR')}
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
              <TH className="hidden sm:table-cell">유형</TH>
              <TH>출시 예정</TH>
              <TH className="hidden sm:table-cell">현재 단계</TH>
              <TH className="hidden md:table-cell">진행률</TH>
              <TH>상태</TH>
              <TH className="hidden lg:table-cell">등록자</TH>
              <TH className="hidden md:table-cell" align="right">등록일</TH>
            </TR>
          </THead>
          <TBody>
            {projects.map((p) => {
              const progress = getProgress(p);
              return (
                <TR key={p.id}>
                  <TD emphasis>
                    <Link
                      href={`/launches/${p.id}`}
                      className="text-[var(--brand-400)] hover:text-[var(--brand-200)] font-medium transition-colors"
                    >
                      {p.productName}
                    </Link>
                  </TD>
                  <TD className="hidden sm:table-cell" muted>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{p.productType || '—'}</span>
                      {p.brandType && (
                        <Badge tone="violet" size="xs">
                          {p.brandType}
                        </Badge>
                      )}
                      {p.storageCondition && (
                        <Badge tone="info" size="xs">
                          {p.storageCondition}
                        </Badge>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <DdayBadge targetLaunchDate={p.targetLaunchDate} />
                      {p.targetLaunchDate && (
                        <span className="hidden lg:inline text-[11.5px] text-[var(--text-3)] tabular">
                          {new Date(p.targetLaunchDate).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD className="hidden sm:table-cell" muted>
                    {getCurrentStage(p)}
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
                  <TD>
                    <StatusPill status={p.status} />
                  </TD>
                  <TD className="hidden lg:table-cell" muted>
                    <span className="block max-w-[160px] truncate" title={userLabel(p.createdBy)}>
                      {userShort(p.createdBy)}
                    </span>
                  </TD>
                  <TD className="hidden md:table-cell" align="right" muted numeric>
                    {new Date(p.createdAt).toLocaleDateString('ko-KR')}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        </div>
        </>
      )}
    </AppLayout>
  );
}
