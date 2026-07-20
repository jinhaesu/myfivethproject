'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api, getFileUrl } from '@/lib/api';
import {
  SalesClient,
  SalesContact,
  SALES_STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  STAGE_DEFAULT_PROB,
  fmtDate,
  fmtKRW,
  weightedRevenue,
} from '@/lib/sales';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Badge,
  EmptyState,
  CenterSpinner,
} from '@/components/ui';

const PROFILE_FIELDS: { key: keyof SalesClient; label: string; long?: boolean }[] = [
  { key: 'bizNumber', label: '사업자번호' },
  { key: 'ownerOrg', label: '담당 조직' },
  { key: 'annualRevenue', label: '바이어·거래처 연매출' },
  { key: 'buyerComposition', label: '바이어 구성', long: true },
  { key: 'existingVendors', label: '기존 거래처', long: true },
  { key: 'managedItems', label: '관리 품목', long: true },
  { key: 'storageCondition', label: '보관 조건' },
  { key: 'logisticsCondition', label: '물류 조건' },
  { key: 'note', label: '비고', long: true },
];

export default function SalesClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [client, setClient] = useState<SalesClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 담당자 추가 폼
  const [newContact, setNewContact] = useState({ name: '', position: '', title: '', phone: '', email: '' });
  const [addingContact, setAddingContact] = useState(false);
  // 명함 OCR
  const ocrFileRef = useRef<HTMLInputElement>(null);
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.sales.getClient(id);
      setClient(data.client);
    } catch (error) {
      console.error('Failed to fetch client:', error);
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const startEdit = () => {
    if (!client) return;
    setForm({
      name: client.name || '',
      stage: client.stage || 'lead',
      expectedRevenue: client.expectedRevenue != null ? String(client.expectedRevenue) : '',
      winProbability: client.winProbability != null ? String(client.winProbability) : '',
      bizNumber: client.bizNumber || '',
      ownerOrg: client.ownerOrg || '',
      annualRevenue: client.annualRevenue || '',
      buyerComposition: client.buyerComposition || '',
      existingVendors: client.existingVendors || '',
      managedItems: client.managedItems || '',
      storageCondition: client.storageCondition || '',
      logisticsCondition: client.logisticsCondition || '',
      note: client.note || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await api.sales.updateClient(id, form);
      await load();
      setEditing(false);
    } catch (error) {
      console.error('Failed to save client:', error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('이 거래처를 삭제하시겠습니까? 관련 영업일지도 함께 삭제됩니다.')) return;
    try {
      await api.sales.deleteClient(id);
      router.push('/sales/clients');
    } catch (error) {
      console.error('Failed to delete client:', error);
    }
  };

  const addContact = async () => {
    if (!newContact.name.trim()) return;
    setAddingContact(true);
    try {
      const res = await api.sales.createContact(id, {
        name: newContact.name.trim(),
        position: newContact.position.trim() || undefined,
        title: newContact.title.trim() || undefined,
        phone: newContact.phone.trim() || undefined,
        email: newContact.email.trim() || undefined,
      });
      // OCR로 첨부한 명함 이미지가 있으면 생성된 담당자에 업로드
      if (cardFile && res?.contact?.id) {
        try {
          await api.sales.uploadCard(res.contact.id, cardFile);
        } catch (e) {
          console.error('Failed to upload OCR card image:', e);
        }
      }
      setNewContact({ name: '', position: '', title: '', phone: '', email: '' });
      setCardFile(null);
      setOcrError('');
      await load();
    } catch (error) {
      console.error('Failed to add contact:', error);
    } finally {
      setAddingContact(false);
    }
  };

  // 명함 이미지 → Opus 4.8 OCR → 담당자 폼 프리필
  const runOcr = async (file: File) => {
    setOcrBusy(true);
    setOcrError('');
    setCardFile(file);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { contact } = await api.ai.parseBusinessCard(dataUrl, file.type);
      setNewContact((prev) => ({
        name: contact?.name?.trim() || prev.name,
        position: contact?.position?.trim() || prev.position,
        title: contact?.title?.trim() || prev.title,
        phone: contact?.phone?.trim() || prev.phone,
        email: contact?.email?.trim() || prev.email,
      }));
    } catch (e) {
      setOcrError((e as Error)?.message || '명함 인식에 실패했습니다.');
    } finally {
      setOcrBusy(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <SalesTabs />
        <CenterSpinner label="거래처 불러오는 중" />
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <SalesTabs />
        <EmptyState
          title="거래처를 찾을 수 없습니다"
          description="삭제되었거나 접근 권한이 없습니다."
          action={
            <Link href="/sales/clients">
              <Button variant="secondary" size="md">거래처 목록으로</Button>
            </Link>
          }
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="거래처"
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            <span className="break-words">{client.name}</span>
            <Badge tone={STAGE_TONE[client.stage] || 'neutral'} size="md">
              {STAGE_LABEL[client.stage] || client.stage}
            </Badge>
          </span>
        }
        actions={
          <>
            {editing ? (
              <>
                <Button variant="primary" size="md" onClick={saveEdit} loading={saving}>저장</Button>
                <Button variant="ghost" size="md" onClick={() => setEditing(false)}>취소</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="md" onClick={startEdit}>수정</Button>
                <Button variant="danger" size="md" onClick={remove}>삭제</Button>
              </>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 프로필 */}
        <Card>
          <CardHeader title="거래처 프로필" />
          {editing ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="거래처명" required className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="영업 단계">
                <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  {SALES_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="예상 매출(월)" hint="원 단위, 예: 30000000">
                <Input
                  type="number"
                  value={form.expectedRevenue || ''}
                  onChange={(e) => setForm({ ...form, expectedRevenue: e.target.value })}
                  placeholder="예: 30000000"
                />
              </Field>
              <Field label="성사 확률(%)" hint="미입력 시 단계 기본값 적용">
                <Select value={form.winProbability || ''} onChange={(e) => setForm({ ...form, winProbability: e.target.value })}>
                  <option value="">단계 기본값</option>
                  {[10, 25, 50, 75, 90].map((p) => (
                    <option key={p} value={p}>{p}%</option>
                  ))}
                </Select>
              </Field>
              {PROFILE_FIELDS.map((f) => (
                <Field key={f.key as string} label={f.label} className={f.long ? 'sm:col-span-2' : ''}>
                  {f.long ? (
                    <Textarea
                      value={form[f.key as string] || ''}
                      onChange={(e) => setForm({ ...form, [f.key as string]: e.target.value })}
                    />
                  ) : (
                    <Input
                      value={form[f.key as string] || ''}
                      onChange={(e) => setForm({ ...form, [f.key as string]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : (
            /* 모바일에서는 라벨 128px + 값이 한 줄에 안 들어가 세로로 쌓는다 */
            <dl className="flex flex-col divide-y divide-[var(--border-1)]">
              <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 py-2">
                <dt className="sm:w-32 flex-shrink-0 text-[12px] text-[var(--text-3)]">예상 매출(월)</dt>
                <dd className="text-[12.5px] text-[var(--text-1)] tabular">{fmtKRW(client.expectedRevenue)}</dd>
              </div>
              <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 py-2">
                <dt className="sm:w-32 flex-shrink-0 text-[12px] text-[var(--text-3)]">성사 확률</dt>
                <dd className="text-[12.5px] text-[var(--text-1)] tabular">
                  {client.winProbability != null ? (
                    `${client.winProbability}%`
                  ) : (
                    <span>
                      {STAGE_DEFAULT_PROB[client.stage] ?? 0}%
                      <span className="text-[11px] text-[var(--text-4)] ml-1.5">(단계 기본)</span>
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 py-2">
                <dt className="sm:w-32 flex-shrink-0 text-[12px] text-[var(--text-3)]">가중 예상매출</dt>
                <dd className="text-[12.5px] font-semibold text-[var(--success-fg)] tabular">
                  {fmtKRW(weightedRevenue(client))}
                </dd>
              </div>
              {PROFILE_FIELDS.map((f) => {
                const v = client[f.key] as string | null;
                return (
                  <div key={f.key as string} className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 py-2">
                    <dt className="sm:w-32 flex-shrink-0 text-[12px] text-[var(--text-3)]">{f.label}</dt>
                    <dd className="text-[12.5px] text-[var(--text-1)] whitespace-pre-wrap break-words">
                      {v || '—'}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </Card>

        {/* 담당자 명함 */}
        <Card>
          <CardHeader title={`담당자 명함 (${client.contacts?.length ?? 0})`} />
          <div className="flex flex-col gap-3">
            {(client.contacts || []).map((c) => (
              <ContactCard key={c.id} contact={c} onChange={load} />
            ))}

            <div className="rounded-lg border border-dashed border-[var(--border-2)] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[12px] font-medium text-[var(--text-2)]">담당자 추가</div>
                <input
                  ref={ocrFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) runOcr(f);
                    e.target.value = '';
                  }}
                />
                <Button variant="secondary" size="xs" onClick={() => ocrFileRef.current?.click()} loading={ocrBusy}>
                  {ocrBusy ? '명함 인식 중…' : '✦ 명함으로 자동 입력'}
                </Button>
              </div>
              {ocrBusy && <div className="text-[11px] text-[var(--text-3)] mb-2">명함 인식 중… (Opus 4.8)</div>}
              {ocrError && <div className="text-[11.5px] text-[var(--danger-fg)] mb-2">{ocrError}</div>}
              {cardFile && !ocrBusy && (
                <div className="flex items-center gap-2 mb-2 text-[11.5px] text-[var(--text-3)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(cardFile)} alt="명함" className="w-16 h-11 object-cover rounded border border-[var(--border-1)]" />
                  <span>명함 첨부됨 — 담당자 추가 시 함께 저장됩니다.</span>
                  <button onClick={() => setCardFile(null)} className="text-[var(--text-4)] hover:text-[var(--danger-fg)]" aria-label="제거">✕</button>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                <Input inputSize="sm" placeholder="이름 *" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                <Input inputSize="sm" placeholder="직급" value={newContact.position} onChange={(e) => setNewContact({ ...newContact, position: e.target.value })} />
                <Input inputSize="sm" placeholder="직함" value={newContact.title} onChange={(e) => setNewContact({ ...newContact, title: e.target.value })} />
                <Input inputSize="sm" placeholder="연락처" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                <Input inputSize="sm" placeholder="이메일" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} className="sm:col-span-2" />
              </div>
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={addContact} loading={addingContact} disabled={!newContact.name.trim()}>
                  + 담당자 추가
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 영업일지 */}
      <Card className="mt-4">
        <CardHeader
          title={`영업일지 (${client.journals?.length ?? 0})`}
          actions={
            <Link href={`/sales/new?clientId=${id}`}>
              <Button variant="secondary" size="sm">+ 새 영업일지</Button>
            </Link>
          }
        />
        {client.journals && client.journals.length > 0 ? (
          <div className="flex flex-col divide-y divide-[var(--border-1)]">
            {client.journals.map((j) => (
              <Link key={j.id} href={`/sales/${j.id}`} className="flex items-center gap-3 py-2.5 group">
                <span className="min-w-0 text-[13px] text-[var(--brand-400)] group-hover:text-[var(--brand-200)] font-medium truncate">
                  {j.title || '(제목 없음)'}
                </span>
                {j.isFirstMeeting ? <Badge tone="violet" size="xs">최초미팅</Badge> : null}
                {j.passwordProtected ? <span className="text-[11px] text-[var(--text-4)]">🔒</span> : null}
                <span className="ml-auto text-[11.5px] text-[var(--text-3)] tabular flex-shrink-0">
                  {fmtDate(j.meetingDate)}
                </span>
                <span className="hidden sm:inline text-[11.5px] text-[var(--text-4)] flex-shrink-0 w-20 text-right truncate">
                  {j.author?.name || ''}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-[12.5px] text-[var(--text-4)] py-2">등록된 영업일지가 없습니다.</div>
        )}
      </Card>

      {/* 영업계획 */}
      <Card className="mt-4">
        <CardHeader
          title={`영업계획 (${client.plans?.length ?? 0})`}
          actions={
            <Link href="/sales/calendar">
              <Button variant="ghost" size="sm">+ 영업계획</Button>
            </Link>
          }
        />
        {client.plans && client.plans.length > 0 ? (
          <div className="flex flex-col divide-y divide-[var(--border-1)]">
            {client.plans.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 text-[13px] text-[var(--text-1)] truncate">{p.title}</span>
                {p.stage ? <Badge tone="neutral" size="xs">{STAGE_LABEL[p.stage] || p.stage}</Badge> : null}
                <span className="ml-auto text-[11.5px] text-[var(--text-3)] tabular">{fmtDate(p.planDate)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12.5px] text-[var(--text-4)] py-2">등록된 영업계획이 없습니다.</div>
        )}
      </Card>
    </AppLayout>
  );
}

function ContactCard({ contact, onChange }: { contact: SalesContact; onChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await api.sales.uploadCard(contact.id, file);
      onChange();
    } catch (error) {
      console.error('Failed to upload card:', error);
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!confirm(`담당자 "${contact.name}"을(를) 삭제하시겠습니까?`)) return;
    try {
      await api.sales.deleteContact(contact.id);
      onChange();
    } catch (error) {
      console.error('Failed to delete contact:', error);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-2)] p-3">
      {contact.cardImageUrl ? (
        <img
          src={getFileUrl(contact.cardImageUrl)}
          alt={`${contact.name} 명함`}
          className="w-full max-h-[140px] object-contain rounded-md bg-[var(--bg-0)] border border-[var(--border-1)]"
        />
      ) : (
        <div className="w-full h-[80px] flex items-center justify-center rounded-md border border-dashed border-[var(--border-2)] text-[11.5px] text-[var(--text-4)]">
          명함 이미지 없음
        </div>
      )}
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-[var(--text-1)]">{contact.name}</span>
        {contact.position ? <span className="text-[11.5px] text-[var(--text-3)]">{contact.position}</span> : null}
        {contact.title ? <span className="text-[11.5px] text-[var(--text-4)]">· {contact.title}</span> : null}
      </div>
      <div className="mt-0.5 flex flex-col gap-0.5 text-[11.5px] text-[var(--text-3)]">
        {contact.phone ? <span className="tabular">{contact.phone}</span> : null}
        {contact.email ? <span className="break-all">{contact.email}</span> : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
        />
        <Button variant="ghost" size="xs" onClick={() => fileRef.current?.click()} loading={uploading}>
          명함 업로드
        </Button>
        <Button variant="ghost" size="xs" onClick={remove}>삭제</Button>
      </div>
    </div>
  );
}
