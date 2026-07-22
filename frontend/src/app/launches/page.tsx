'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { LaunchProject, getDday } from '@/lib/launch';
import { userLabel, userShort } from '@/lib/user';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Select,
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

interface ClientSuggestion {
  projectId: string;
  productName: string;
  storageCondition: string | null;
  brandType: string | null;
  editProtected: boolean;
  looksExclusive: boolean;
  confidentClientId: string | null;
  candidates: { id: string; name: string }[];
}

// 프로젝트명에 이미 들어 있는 거래처 정보를 읽어 매핑 후보를 제시한다.
// 자동 적용하지 않는 이유 — 제품명만 보고 확정하면 남의 PB를 자사 라인업으로
// (또는 그 반대로) 잘못 표기하게 되고, 브랜드 귀속은 계약 사안이라 되돌리기 어렵다.
function ClientMappingCard({
  items,
  onApplied,
}: {
  items: ClientSuggestion[];
  onApplied: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  // 이름으로 후보를 못 찾은 건("[편의점 전용]" 처럼)도 직접 고를 수 있어야 한다
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.listClients();
        setAllClients((data.clients || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      } catch (e) {
        console.error('Failed to fetch clients:', e);
      }
    })();
  }, []);

  // 고른 거래처 수가 곧 구분이다 — 1곳이면 거래처 전용, 여러 곳이면 채널 전용
  const valueOf = (it: ClientSuggestion): string[] =>
    picked[it.projectId] ?? (it.confidentClientId ? [it.confidentClientId] : []);

  const toggle = (it: ClientSuggestion, id: string) => {
    const cur = valueOf(it);
    setPicked((p) => ({
      ...p,
      [it.projectId]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    }));
  };

  const apply = async (it: ClientSuggestion) => {
    const ids = valueOf(it);
    if (ids.length === 0) return;
    setBusyId(it.projectId);
    setError('');
    try {
      await api.launches.update(
        it.projectId,
        ids.length === 1
          ? { launchScope: 'client', clientId: ids[0], clientIds: [] }
          : { launchScope: 'channel', clientIds: ids },
      );
      onApplied();
    } catch (e) {
      const msg = (e as Error)?.message || '거래처 지정에 실패했습니다.';
      setError(
        it.editProtected
          ? `${it.productName}: 편집 잠금이 걸려 있습니다. 프로젝트 상세에서 잠금을 해제한 뒤 지정해주세요.`
          : `${it.productName}: ${msg}`,
      );
    } finally {
      setBusyId('');
    }
  };

  return (
    <Card padding="lg" className="mb-6 border-[var(--warning-border)]">
      <CardHeader
        title={`거래처 매핑이 필요한 프로젝트 (${items.length})`}
        subtitle="제품명에 거래처나 '전용' 표기가 있는데 아직 거래처가 지정되지 않은 건입니다. 지정하면 그 거래처 화면과 영업 캘린더 필터에 함께 잡힙니다."
      />
      {error && <div className="mb-3 text-[12px] text-[var(--danger-fg)]">{error}</div>}
      <div className="flex flex-col gap-2">
        {items.map((it) => {
          const val = valueOf(it);
          // 후보를 앞에 두고 나머지 거래처를 뒤에 붙인다 (후보가 없는 건도 직접 고를 수 있어야 한다)
          const chips = [
            ...it.candidates,
            ...allClients.filter((c) => !it.candidates.some((x) => x.id === c.id)),
          ];
          return (
            <div
              key={it.projectId}
              className="px-2.5 py-2 rounded-md border border-[var(--border-1)] bg-[var(--bg-1)]"
            >
              <div className="mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    href={`/launches/${it.projectId}`}
                    className="text-[12.5px] text-[var(--text-1)] hover:text-[var(--brand-400)] transition-colors"
                  >
                    {it.productName}
                  </Link>
                  {it.storageCondition ? (
                    <Badge tone="info" size="xs">
                      {it.storageCondition}
                    </Badge>
                  ) : null}
                  {it.brandType ? (
                    <Badge tone="violet" size="xs">
                      {it.brandType}
                    </Badge>
                  ) : null}
                  {it.editProtected ? (
                    <Badge tone="neutral" size="xs">
                      편집 잠김
                    </Badge>
                  ) : null}
                </div>
                {it.candidates.length === 0 && (
                  <div className="text-[11px] text-[var(--warning-fg)] mt-0.5">
                    이름만으로는 거래처를 특정할 수 없습니다. 직접 선택해주세요.
                  </div>
                )}
                {it.candidates.length > 1 && !it.confidentClientId && (
                  <div className="text-[11px] text-[var(--warning-fg)] mt-0.5">
                    후보가 여러 곳입니다. 보관 조건으로도 좁혀지지 않아 확인이 필요합니다.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {chips.map((c) => {
                  const on = val.includes(c.id);
                  const isCandidate = it.candidates.some((x) => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(it, c.id)}
                      aria-pressed={on}
                      className={
                        'inline-flex items-center h-7 px-2.5 rounded-full border text-[11.5px] transition-colors ' +
                        (on
                          ? 'border-[var(--brand-500)] bg-[var(--bg-2)] text-[var(--text-1)]'
                          : isCandidate
                          ? 'border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--bg-2)]'
                          : 'border-[var(--border-1)] text-[var(--text-4)] hover:bg-[var(--bg-2)]')
                      }
                    >
                      {on ? '✓ ' : ''}
                      {c.name}
                      {c.id === it.confidentClientId ? ' (추천)' : ''}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => apply(it)}
                  loading={busyId === it.projectId}
                  disabled={val.length === 0}
                >
                  {val.length > 1 ? `채널 전용으로 지정 (${val.length}곳)` : '거래처 전용으로 지정'}
                </Button>
                <span className="text-[11px] text-[var(--text-4)]">
                  1곳만 고르면 거래처 전용, 여러 곳을 고르면 채널 전용이 됩니다.
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--text-4)] mt-3">
        브랜드 공식 출시(자사 정식 라인업)라면 그대로 두면 됩니다. 이 목록은 거래처가 지정되면 사라집니다.
      </p>
    </Card>
  );
}

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
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);

  const load = useCallback(async () => {
    try {
      const [data, sug] = await Promise.all([
        api.launches.list('launch'),
        api.launches.clientSuggestions('launch').catch(() => ({ items: [] })),
      ]);
      setProjects(data.projects);
      setSuggestions(sug.items || []);
    } catch (error) {
      console.error('Failed to fetch launch projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      {!loading && suggestions.length > 0 && (
        <ClientMappingCard items={suggestions} onApplied={load} />
      )}

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
                    {/* 거래처·채널 전용은 자사 라인업과 섞이면 안 되므로 목록에서 바로 구분한다 */}
                    {p.launchScope === 'client' && (
                      <Badge tone="brand" size="xs">
                        {p.client?.name ? `${p.client.name} 전용` : '거래처 전용'}
                      </Badge>
                    )}
                    {p.launchScope === 'channel' && (
                      <Badge tone="brand" size="xs">
                        채널 전용 {(p.targetClients || []).length}곳
                      </Badge>
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
