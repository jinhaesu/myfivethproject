'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/sales';
import {
  Deliberation,
  ScheduleEvent,
  STATUS_LABEL,
  STATUS_TONE,
  STATUS_ORDER,
  reviewTypeLabel,
  confirmProgress,
} from '@/lib/deliberation';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Field,
  Badge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface Meta {
  categories: { key: string; label: string }[];
  adChannels: { key: string; label: string }[];
  statuses: { key: string; label: string }[];
  departments: string[];
  commonIngredients: string[];
  products: { id: string; productName: string; productType?: string | null }[];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DeliberationsPage() {
  const [view, setView] = useState<'list' | 'schedule'>('list');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setMeta(await api.deliberations.meta());
      } catch {
        /* 메타 실패해도 화면은 뜬다 */
      }
    })();
  }, []);

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Ingredient Deliberation"
        title="고시형 원료 심의 관리"
        description="난소화성말토덱스트린 등 고시형 원료의 영양기준·광고 심의를 제품별로 제안·결과 일정과 상태로 관리하고, 부서간 확인을 남깁니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-md border border-[var(--border-2)] overflow-hidden">
              {(['list', 'schedule'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    'px-3 h-8 text-[12.5px] transition-colors ' +
                    (view === v
                      ? 'bg-[var(--brand-500)] text-white'
                      : 'text-[var(--text-3)] hover:bg-[var(--bg-2)] hover:text-[var(--text-1)]')
                  }
                >
                  {v === 'list' ? '목록' : '일정'}
                </button>
              ))}
            </div>
            <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
              + 심의 등록
            </Button>
          </div>
        }
      />

      {view === 'list' ? <ListView meta={meta} /> : <ScheduleView />}

      {showForm && meta && (
        <DeliberationForm
          meta={meta}
          onClose={() => setShowForm(false)}
          onCreated={() => setShowForm(false)}
        />
      )}
    </AppLayout>
  );
}

// ─────────────────────────── 목록 뷰 ───────────────────────────
function ListView({ meta }: { meta: Meta | null }) {
  const router = useRouter();
  const [items, setItems] = useState<Deliberation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.deliberations.list({
        status: status || undefined,
        category: category || undefined,
        q: q.trim() || undefined,
      });
      setItems(data.deliberations || []);
    } catch (e) {
      console.error('Deliberation list failed:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, category, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of items) c[d.status] = (c[d.status] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div>
      {/* 상태 요약 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          onClick={() => setStatus('')}
          className={
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] transition-colors ' +
            (!status
              ? 'border-[var(--brand-500)] bg-[var(--bg-2)] text-[var(--text-1)]'
              : 'border-[var(--border-2)] text-[var(--text-3)] hover:text-[var(--text-1)]')
          }
        >
          전체 <span className="tabular text-[var(--text-4)]">{items.length}</span>
        </button>
        {STATUS_ORDER.map((sKey) => (
          <button
            key={sKey}
            onClick={() => setStatus((prev) => (prev === sKey ? '' : sKey))}
            className={
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] transition-colors ' +
              (status === sKey
                ? 'border-[var(--brand-500)] bg-[var(--bg-2)] text-[var(--text-1)]'
                : 'border-[var(--border-2)] text-[var(--text-3)] hover:text-[var(--text-1)]')
            }
          >
            {STATUS_LABEL[sKey]}
            <span className="tabular text-[var(--text-4)]">{counts[sKey] || 0}</span>
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-[150px]">
          <option value="">전체 종류</option>
          {(meta?.categories || []).map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제품·원료·제목 검색"
          className="w-full sm:w-[260px]"
        />
      </div>

      {loading ? (
        <CenterSpinner label="불러오는 중" />
      ) : items.length === 0 ? (
        <EmptyState
          title="등록된 심의 건이 없습니다"
          description="상단의 ‘+ 심의 등록’으로 고시형 원료 심의 건을 추가하세요."
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>대상 제품 · 원료</TH>
                <TH className="hidden sm:table-cell">심의 종류</TH>
                <TH>제안일</TH>
                <TH>결과일</TH>
                <TH>상태</TH>
                <TH>부서 확인</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((d) => {
                const { done, total } = confirmProgress(d.confirmations);
                return (
                  <TR
                    key={d.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/deliberations/${d.id}`)}
                  >
                    <TD emphasis>
                      <div className="text-[var(--text-1)] font-medium">{d.productName}</div>
                      <div className="text-[11.5px] text-[var(--text-3)]">
                        {d.ingredientName}
                        {d.title ? <span className="text-[var(--text-4)]"> · {d.title}</span> : null}
                      </div>
                    </TD>
                    <TD className="hidden sm:table-cell" muted>
                      {reviewTypeLabel(d)}
                    </TD>
                    <TD numeric muted>{fmtDate(d.proposalDate) || '—'}</TD>
                    <TD numeric muted>{fmtDate(d.resultDate) || '—'}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[d.status]} size="xs">
                        {STATUS_LABEL[d.status]}
                      </Badge>
                    </TD>
                    <TD>
                      <span
                        className={
                          'tabular text-[12px] ' +
                          (total > 0 && done === total
                            ? 'text-[var(--success-fg)]'
                            : 'text-[var(--text-3)]')
                        }
                      >
                        {done}/{total}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────── 일정(캘린더) 뷰 ───────────────────────────
function ScheduleView() {
  const router = useRouter();
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to, monthOf } = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    const gridEnd = addDays(gridStart, 41);
    return { from: gridStart, to: new Date(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate(), 23, 59, 59), monthOf: first };
  }, [anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.deliberations.schedule(from.toISOString(), to.toISOString());
      setEvents(data.events || []);
    } catch (e) {
      console.error('Deliberation schedule failed:', e);
      setEvents([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymd(from), ymd(to)]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const ev of events) {
      const key = ymd(new Date(ev.date));
      (map[key] = map[key] || []).push(ev);
    }
    return map;
  }, [events]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));

  const upcoming = useMemo(
    () => [...events].sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [events],
  );

  return (
    <div>
      {/* 컨트롤 + 범례 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-[var(--border-2)] overflow-hidden">
            <button onClick={() => setAnchor((a) => addMonths(a, -1))} className="px-2.5 h-8 text-[var(--text-2)] hover:bg-[var(--bg-2)]" aria-label="이전 달">‹</button>
            <button onClick={() => setAnchor(new Date())} className="px-3 h-8 text-[12.5px] text-[var(--text-2)] hover:bg-[var(--bg-2)] border-x border-[var(--border-2)]">오늘</button>
            <button onClick={() => setAnchor((a) => addMonths(a, 1))} className="px-2.5 h-8 text-[var(--text-2)] hover:bg-[var(--bg-2)]" aria-label="다음 달">›</button>
          </div>
          <span className="text-[15px] font-semibold text-[var(--text-1)] tabular">
            {monthOf.getFullYear()}년 {monthOf.getMonth() + 1}월
          </span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-[var(--text-3)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--info-fg)' }} /> 제안일정
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--success-fg)' }} /> 결과일정
          </span>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden mb-6">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={
                'text-center text-[11px] py-1.5 border-b border-[var(--border-1)] ' +
                (i === 0 ? 'text-[var(--danger-fg)]' : i === 6 ? 'text-[var(--info-fg)]' : 'text-[var(--text-3)]')
              }
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const key = ymd(d);
            const list = byDay[key] || [];
            const inMonth = d.getMonth() === monthOf.getMonth();
            const isToday = sameDay(d, today);
            return (
              <div
                key={key}
                className="min-h-[64px] sm:min-h-[104px] border-b border-r border-[var(--border-1)] p-1 flex flex-col gap-0.5"
              >
                <span
                  className={
                    'text-[11.5px] tabular px-0.5 ' +
                    (isToday
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--brand-500)] text-white'
                      : inMonth
                      ? d.getDay() === 0
                        ? 'text-[var(--danger-fg)]'
                        : d.getDay() === 6
                        ? 'text-[var(--info-fg)]'
                        : 'text-[var(--text-2)]'
                      : 'text-[var(--text-4)]')
                  }
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {list.slice(0, 3).map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => router.push(`/deliberations/${ev.deliberationId}`)}
                      title={`[${ev.kind === 'proposal' ? '제안' : '결과'}] ${ev.productName} · ${ev.ingredientName}`}
                      className="flex items-center gap-1 w-full text-left truncate text-[10.5px] leading-tight rounded-sm pl-1 pr-1 py-[2px] hover:bg-[var(--bg-3)] transition-colors"
                      style={{
                        borderLeft: `2px solid ${ev.kind === 'proposal' ? 'var(--info-fg)' : 'var(--success-fg)'}`,
                      }}
                    >
                      <span className="truncate text-[var(--text-2)]">
                        {ev.kind === 'proposal' ? '제안' : '결과'} · {ev.productName}
                      </span>
                    </button>
                  ))}
                  {list.length > 3 && (
                    <span className="text-[10px] text-[var(--text-4)] pl-1">+{list.length - 3}건</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 이 달 일정 목록 */}
      <div className="mb-2 text-[12.5px] text-[var(--text-3)]">이 기간 일정 {events.length}건</div>
      {loading ? (
        <CenterSpinner label="일정 불러오는 중" />
      ) : events.length === 0 ? (
        <EmptyState title="이 달에 표시할 일정이 없습니다" description="다른 달을 보거나 심의 건에 제안·결과 일정을 입력하세요." />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>날짜</TH>
                <TH>구분</TH>
                <TH>제품 · 원료</TH>
                <TH>상태</TH>
              </TR>
            </THead>
            <TBody>
              {upcoming.map((ev) => (
                <TR
                  key={ev.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/deliberations/${ev.deliberationId}`)}
                >
                  <TD numeric muted>{fmtDate(ev.date)}</TD>
                  <TD>
                    <Badge tone={ev.kind === 'proposal' ? 'info' : 'success'} size="xs">
                      {ev.kind === 'proposal' ? '제안' : '결과'}
                    </Badge>
                  </TD>
                  <TD emphasis>
                    <span className="text-[var(--text-1)]">{ev.productName}</span>
                    <span className="text-[11.5px] text-[var(--text-3)]"> · {ev.ingredientName}</span>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[ev.status]} size="xs">
                      {STATUS_LABEL[ev.status]}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────── 등록 폼 ───────────────────────────
function DeliberationForm({
  meta,
  onClose,
  onCreated,
}: {
  meta: Meta;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [manualProduct, setManualProduct] = useState(false);
  const [labelId, setLabelId] = useState('');
  const [productName, setProductName] = useState('');
  const [ingredientName, setIngredientName] = useState('');
  const [functionalClaim, setFunctionalClaim] = useState('');
  const [category, setCategory] = useState('nutrition');
  const [adChannel, setAdChannel] = useState('detail_page');
  const [reviewBody, setReviewBody] = useState('');
  const [title, setTitle] = useState('');
  const [proposalDate, setProposalDate] = useState('');
  const [resultDate, setResultDate] = useState('');
  const [status, setStatus] = useState('planned');
  const [departments, setDepartments] = useState<string[]>(meta.departments);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleDept = (d: string) =>
    setDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = async () => {
    setError('');
    if (!manualProduct && !labelId) return setError('등록 제품을 선택하거나 직접 입력을 선택하세요.');
    if (manualProduct && !productName.trim()) return setError('제품명을 입력해주세요.');
    if (!ingredientName.trim()) return setError('고시형 원료명을 입력해주세요.');
    setBusy(true);
    try {
      const created = await api.deliberations.create({
        labelId: manualProduct ? undefined : labelId,
        productName: manualProduct ? productName.trim() : undefined,
        ingredientName: ingredientName.trim(),
        functionalClaim: functionalClaim.trim() || undefined,
        category,
        adChannel: category === 'advertising' ? adChannel : undefined,
        reviewBody: reviewBody.trim() || undefined,
        title: title.trim() || undefined,
        proposalDate: proposalDate || undefined,
        resultDate: resultDate || undefined,
        status,
        departments,
      });
      onCreated();
      router.push(`/deliberations/${created.deliberation.id}`);
    } catch (e: any) {
      setError(e?.message || '등록에 실패했습니다.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-3 sm:p-8 bg-[var(--bg-overlay)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-lg mt-4 sm:mt-10 mb-6" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" tone="elevated">
          <div className="text-[15px] font-semibold text-[var(--text-1)] mb-4">고시형 원료 심의 등록</div>
          <div className="flex flex-col gap-3 max-h-[72vh] overflow-y-auto pr-0.5">
            {/* 대상 제품 */}
            <Field label="대상 제품" required>
              <div className="flex items-center gap-2 mb-2">
                <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
                  <input
                    type="checkbox"
                    checked={manualProduct}
                    onChange={(e) => setManualProduct(e.target.checked)}
                  />
                  등록 제품에 없음 (직접 입력)
                </label>
              </div>
              {manualProduct ? (
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="제품명 직접 입력"
                />
              ) : (
                <Select value={labelId} onChange={(e) => setLabelId(e.target.value)}>
                  <option value="">등록 제품 선택</option>
                  {meta.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.productName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="고시형 원료" required hint="개별인정형 원료도 포함">
                <Input
                  value={ingredientName}
                  onChange={(e) => setIngredientName(e.target.value)}
                  list="ingredient-suggestions"
                  placeholder="예: 난소화성말토덱스트린"
                />
                <datalist id="ingredient-suggestions">
                  {meta.commonIngredients.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field label="심의기관">
                <Input
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  placeholder="예: 한국건강기능식품협회"
                />
              </Field>
            </div>

            <Field label="기능성 내용">
              <Input
                value={functionalClaim}
                onChange={(e) => setFunctionalClaim(e.target.value)}
                placeholder="예: 식후 혈당상승 억제·배변활동 원활에 도움"
              />
            </Field>

            {/* 심의 종류 */}
            <Field label="심의 종류" required>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {meta.categories.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={
                      'h-8 px-3 rounded-md border text-[12.5px] transition-colors ' +
                      (category === c.key
                        ? 'border-[var(--brand-500)] bg-[var(--bg-2)] text-[var(--text-1)]'
                        : 'border-[var(--border-2)] text-[var(--text-3)] hover:text-[var(--text-1)]')
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {category === 'advertising' && (
                <Select value={adChannel} onChange={(e) => setAdChannel(e.target.value)}>
                  {meta.adChannels.map((c) => (
                    <option key={c.key} value={c.key}>
                      광고 · {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="제목(선택)">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 리뉴얼 상세페이지 심의" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="제안 일정">
                <Input type="date" value={proposalDate} onChange={(e) => setProposalDate(e.target.value)} />
              </Field>
              <Field label="결과 일정">
                <Input type="date" value={resultDate} onChange={(e) => setResultDate(e.target.value)} />
              </Field>
              <Field label="상태">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {meta.statuses.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* 부서 확인 대상 */}
            <Field label="부서 확인 대상" hint="선택한 부서가 확인 항목으로 생성됩니다. 상세에서 추가·수정할 수 있습니다.">
              <div className="flex flex-wrap gap-1.5">
                {meta.departments.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDept(d)}
                    className={
                      'h-7 px-2.5 rounded-full border text-[12px] transition-colors ' +
                      (departments.includes(d)
                        ? 'border-[var(--brand-500)] bg-[var(--bg-2)] text-[var(--text-1)]'
                        : 'border-[var(--border-2)] text-[var(--text-4)]')
                    }
                  >
                    {departments.includes(d) ? '✓ ' : ''}
                    {d}
                  </button>
                ))}
              </div>
            </Field>

            {error && <div className="text-[12px] text-[var(--danger-fg)]">{error}</div>}
            <div className="flex justify-end gap-2 mt-1">
              <Button variant="ghost" size="md" onClick={onClose}>
                취소
              </Button>
              <Button variant="primary" size="md" loading={busy} onClick={submit}>
                등록
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
