'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import ChangeLogSection from '@/components/ChangeLogSection';
import { api } from '@/lib/api';
import { fmtDate, toDateInput } from '@/lib/sales';
import {
  Deliberation,
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
  Textarea,
  Field,
  Badge,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

interface Meta {
  categories: { key: string; label: string }[];
  adChannels: { key: string; label: string }[];
  statuses: { key: string; label: string }[];
  departments: string[];
  commonIngredients: string[];
  products: { id: string; productName: string }[];
}

function dateInputValue(iso: string | null): string {
  return iso ? toDateInput(new Date(iso)) : '';
}

export default function DeliberationDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const [d, setD] = useState<Deliberation | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.deliberations.get(id);
      setD(data.deliberation);
    } catch (e: any) {
      setErr(e?.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    (async () => {
      try {
        setMeta(await api.deliberations.meta());
      } catch {
        /* noop */
      }
    })();
  }, [load]);

  const patch = async (data: any) => {
    setBusy(true);
    try {
      const res = await api.deliberations.update(id, data);
      setD(res.deliberation);
    } catch (e: any) {
      alert(e?.message || '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('이 심의 건을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setBusy(true);
    try {
      await api.deliberations.delete(id);
      router.push('/deliberations');
    } catch (e: any) {
      alert(e?.message || '삭제에 실패했습니다.');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <CenterSpinner label="불러오는 중" />
      </AppLayout>
    );
  }
  if (!d) {
    return (
      <AppLayout>
        <EmptyState title="심의 건을 찾을 수 없습니다" description={err || '삭제되었거나 잘못된 주소입니다.'} />
        <div className="mt-4">
          <Link href="/deliberations">
            <Button variant="secondary" size="md">목록으로</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="원료 심의"
        title={d.productName}
        description={`${d.ingredientName} · ${reviewTypeLabel(d)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={d.status}
              onChange={(e) => patch({ status: e.target.value })}
              disabled={busy}
              className="w-[130px]"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="md" onClick={() => setEditing((v) => !v)}>
              {editing ? '수정 닫기' : '수정'}
            </Button>
            <Button variant="ghost" size="md" onClick={remove} disabled={busy}>
              삭제
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <Badge tone={STATUS_TONE[d.status]} size="sm">
          {STATUS_LABEL[d.status]}
        </Badge>
        {d.label && (
          <Link href={`/labels/${d.label.id}`} className="text-[12px] text-[var(--brand-400)] hover:text-[var(--brand-200)]">
            표기사항 상세 →
          </Link>
        )}
      </div>

      {editing && meta ? (
        <EditForm
          d={d}
          meta={meta}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setD(next);
            setEditing(false);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 좌: 심의 정보 + 일정 */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Card padding="lg">
              <div className="text-[13px] font-semibold text-[var(--text-1)] mb-3">심의 정보</div>
              <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-[13px]">
                <InfoRow k="대상 제품" v={d.productName} />
                <InfoRow k="고시형 원료" v={d.ingredientName} />
                <InfoRow k="기능성 내용" v={d.functionalClaim} />
                <InfoRow k="심의 종류" v={reviewTypeLabel(d)} />
                <InfoRow k="심의기관" v={d.reviewBody} />
                {d.title && <InfoRow k="제목" v={d.title} />}
                {d.referenceUrl && (
                  <>
                    <dt className="text-[var(--text-4)]">관련 링크</dt>
                    <dd className="min-w-0">
                      <a href={d.referenceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-400)] hover:text-[var(--brand-200)] break-all">
                        {d.referenceUrl}
                      </a>
                    </dd>
                  </>
                )}
                <InfoRow k="결과 코멘트" v={d.resultNote} />
                <InfoRow k="메모" v={d.memo} />
              </dl>
            </Card>

            {/* 일정 — 인라인 편집 */}
            <Card padding="lg">
              <div className="text-[13px] font-semibold text-[var(--text-1)] mb-3">일정</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="제안 일정">
                  <Input
                    type="date"
                    defaultValue={dateInputValue(d.proposalDate)}
                    onChange={(e) => patch({ proposalDate: e.target.value || null })}
                    disabled={busy}
                  />
                </Field>
                <Field label="결과 일정">
                  <Input
                    type="date"
                    defaultValue={dateInputValue(d.resultDate)}
                    onChange={(e) => patch({ resultDate: e.target.value || null })}
                    disabled={busy}
                  />
                </Field>
              </div>
              <p className="text-[11.5px] text-[var(--text-4)] mt-2">
                날짜를 바꾸면 자동 저장되고, 상단 ‘원료 심의’ 메뉴의 ‘일정’ 캘린더에 반영됩니다.
              </p>
            </Card>
          </div>

          {/* 우: 부서간 확인 */}
          <div>
            <DepartmentConfirmations d={d} onChanged={load} />
          </div>
        </div>
      )}

      <div className="mt-4">
        <ChangeLogSection entityType="deliberation" entityId={d.id} />
      </div>
    </AppLayout>
  );
}

function InfoRow({ k, v }: { k: string; v: string | null }) {
  return (
    <>
      <dt className="text-[var(--text-4)]">{k}</dt>
      <dd className="text-[var(--text-1)] break-words">
        {v || <span className="text-[var(--text-4)]">—</span>}
      </dd>
    </>
  );
}

// ─────────────────── 부서간 확인 ───────────────────
function DepartmentConfirmations({ d, onChanged }: { d: Deliberation; onChanged: () => void }) {
  const [newDept, setNewDept] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { done, total } = confirmProgress(d.confirmations);

  const toggle = async (cid: string, confirmed: boolean) => {
    setBusyId(cid);
    try {
      await api.deliberations.updateConfirmation(cid, { confirmed });
      onChanged();
    } catch (e: any) {
      alert(e?.message || '변경에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };
  const removeDept = async (cid: string) => {
    setBusyId(cid);
    try {
      await api.deliberations.deleteConfirmation(cid);
      onChanged();
    } catch (e: any) {
      alert(e?.message || '삭제에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };
  const addDept = async () => {
    if (!newDept.trim()) return;
    setAdding(true);
    try {
      await api.deliberations.addConfirmation(d.id, newDept.trim());
      setNewDept('');
      onChanged();
    } catch (e: any) {
      alert(e?.message || '추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-[var(--text-1)]">부서간 확인</span>
        <Badge tone={total > 0 && done === total ? 'success' : 'neutral'} size="xs">
          {done}/{total} 완료
        </Badge>
      </div>

      {d.confirmations.length === 0 ? (
        <p className="text-[12px] text-[var(--text-4)] py-2">확인 대상 부서가 없습니다. 아래에서 추가하세요.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {d.confirmations.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 p-2 rounded-md border border-[var(--border-1)] bg-[var(--bg-1)]"
            >
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => toggle(c.id, !c.confirmed)}
                title={c.confirmed ? '확인 해제' : '확인 완료로 표시'}
                className={
                  'inline-flex items-center justify-center w-5 h-5 rounded border flex-shrink-0 transition-colors ' +
                  (c.confirmed
                    ? 'bg-[var(--success-fg)] border-[var(--success-fg)] text-white'
                    : 'border-[var(--border-3)] hover:border-[var(--brand-500)]')
                }
              >
                {c.confirmed ? '✓' : ''}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-[var(--text-1)] font-medium">{c.department}</div>
                {c.confirmed && (
                  <div className="text-[11px] text-[var(--text-4)]">
                    {c.confirmedBy || '확인자'} · {fmtDate(c.confirmedAt)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeDept(c.id)}
                disabled={busyId === c.id}
                aria-label="부서 삭제"
                className="text-[var(--text-4)] hover:text-[var(--danger-fg)] transition-colors text-[13px] flex-shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-3">
        <Input
          value={newDept}
          onChange={(e) => setNewDept(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addDept();
          }}
          placeholder="부서 추가 (예: 법무)"
          className="flex-1"
        />
        <Button variant="secondary" size="sm" loading={adding} onClick={addDept}>
          추가
        </Button>
      </div>
    </Card>
  );
}

// ─────────────────── 수정 폼 ───────────────────
function EditForm({
  d,
  meta,
  onCancel,
  onSaved,
}: {
  d: Deliberation;
  meta: Meta;
  onCancel: () => void;
  onSaved: (next: Deliberation) => void;
}) {
  const [productName, setProductName] = useState(d.productName);
  const [ingredientName, setIngredientName] = useState(d.ingredientName);
  const [functionalClaim, setFunctionalClaim] = useState(d.functionalClaim || '');
  const [category, setCategory] = useState(d.category);
  const [adChannel, setAdChannel] = useState(d.adChannel || 'detail_page');
  const [reviewBody, setReviewBody] = useState(d.reviewBody || '');
  const [title, setTitle] = useState(d.title || '');
  const [referenceUrl, setReferenceUrl] = useState(d.referenceUrl || '');
  const [resultNote, setResultNote] = useState(d.resultNote || '');
  const [memo, setMemo] = useState(d.memo || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!productName.trim()) return setError('제품명을 입력해주세요.');
    if (!ingredientName.trim()) return setError('고시형 원료명을 입력해주세요.');
    setBusy(true);
    try {
      const res = await api.deliberations.update(d.id, {
        productName: productName.trim(),
        ingredientName: ingredientName.trim(),
        functionalClaim: functionalClaim.trim() || null,
        category,
        adChannel: category === 'advertising' ? adChannel : null,
        reviewBody: reviewBody.trim() || null,
        title: title.trim() || null,
        referenceUrl: referenceUrl.trim() || null,
        resultNote: resultNote.trim() || null,
        memo: memo.trim() || null,
      });
      onSaved(res.deliberation);
    } catch (e: any) {
      setError(e?.message || '저장에 실패했습니다.');
      setBusy(false);
    }
  };

  return (
    <Card padding="lg">
      <div className="text-[13px] font-semibold text-[var(--text-1)] mb-3">심의 정보 수정</div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="대상 제품" required>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
          </Field>
          <Field label="고시형 원료" required>
            <Input value={ingredientName} onChange={(e) => setIngredientName(e.target.value)} list="edit-ingredients" />
            <datalist id="edit-ingredients">
              {meta.commonIngredients.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="기능성 내용">
          <Input value={functionalClaim} onChange={(e) => setFunctionalClaim(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="심의 종류" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value as any)}>
              {meta.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          {category === 'advertising' && (
            <Field label="광고 매체">
              <Select value={adChannel} onChange={(e) => setAdChannel(e.target.value)}>
                {meta.adChannels.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="심의기관">
            <Input value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} />
          </Field>
        </div>
        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="관련 링크 (상세페이지 URL 등)">
          <Input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="결과 코멘트">
          <Textarea value={resultNote} onChange={(e) => setResultNote(e.target.value)} placeholder="반려 사유·조건부 승인 내용 등" />
        </Field>
        <Field label="메모">
          <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        {error && <div className="text-[12px] text-[var(--danger-fg)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onCancel}>
            취소
          </Button>
          <Button variant="primary" size="md" loading={busy} onClick={save}>
            저장
          </Button>
        </div>
      </div>
    </Card>
  );
}
