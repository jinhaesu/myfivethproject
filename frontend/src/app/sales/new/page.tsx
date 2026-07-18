'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SalesClient, SALES_STAGES, todoSuggestionsForStage } from '@/lib/sales';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  CenterSpinner,
} from '@/components/ui';

interface TodoRow {
  dueDate: string;
  content: string;
  plan: string;
  custom?: boolean; // true면 드롭다운 대신 직접 입력
}

const TODO_OTHER = '__other__';

export default function NewSalesJournalPage() {
  const router = useRouter();
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState('');
  const [isFirstMeeting, setIsFirstMeeting] = useState(false);

  // 최초 미팅 거래처 프로필
  const [ownerOrg, setOwnerOrg] = useState('');
  const [buyerComposition, setBuyerComposition] = useState('');
  const [annualRevenue, setAnnualRevenue] = useState('');
  const [existingVendors, setExistingVendors] = useState('');
  const [managedItems, setManagedItems] = useState('');
  const [storageCondition, setStorageCondition] = useState('');
  const [logisticsCondition, setLogisticsCondition] = useState('');

  // 미팅 정보
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingPurpose, setMeetingPurpose] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [attendees, setAttendees] = useState('');
  const [meetingSummary, setMeetingSummary] = useState('');
  const [keyRequests, setKeyRequests] = useState('');
  const [productRequests, setProductRequests] = useState('');

  const [referrers, setReferrers] = useState<string[]>(['']);
  const [todos, setTodos] = useState<TodoRow[]>([{ dueDate: '', content: '', plan: '' }]);
  const [password, setPassword] = useState('');

  // 첨부(저장 시 일지 생성 후 업로드)
  const [proposalFiles, setProposalFiles] = useState<File[]>([]);
  const [cardFiles, setCardFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // AI 자동 작성 (Opus 4.8)
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNote, setAiNote] = useState('');

  const runAiDraft = async () => {
    if (!clientId) {
      setAiError('먼저 거래처를 선택해주세요.');
      return;
    }
    setDrafting(true);
    setAiError('');
    setAiNote('');
    try {
      const clientName = clients.find((c) => c.id === clientId)?.name || '';
      const { draft } = await api.ai.draftSalesJournal({
        clientName,
        clientStage: stage || undefined,
        isFirstMeeting,
        meetingDate: meetingDate || undefined,
        partial: { title, meetingPurpose, meetingLocation, attendees, meetingSummary, keyRequests, productRequests },
        clientProfile: isFirstMeeting
          ? { ownerOrg, buyerComposition, annualRevenue, existingVendors, managedItems, storageCondition, logisticsCondition }
          : {},
      });
      // 비어 있는 항목만 채움(사용자가 이미 쓴 내용은 보존)
      const fillIfEmpty = (cur: string, setter: (v: string) => void, val: unknown) => {
        if (!cur.trim() && val && String(val).trim()) setter(String(val));
      };
      fillIfEmpty(title, setTitle, draft.title);
      fillIfEmpty(meetingPurpose, setMeetingPurpose, draft.meetingPurpose);
      fillIfEmpty(meetingLocation, setMeetingLocation, draft.meetingLocation);
      fillIfEmpty(attendees, setAttendees, draft.attendees);
      fillIfEmpty(meetingSummary, setMeetingSummary, draft.meetingSummary);
      fillIfEmpty(keyRequests, setKeyRequests, draft.keyRequests);
      fillIfEmpty(productRequests, setProductRequests, draft.productRequests);
      if (isFirstMeeting && draft.clientProfile) {
        const p = draft.clientProfile;
        fillIfEmpty(ownerOrg, setOwnerOrg, p.ownerOrg);
        fillIfEmpty(buyerComposition, setBuyerComposition, p.buyerComposition);
        fillIfEmpty(annualRevenue, setAnnualRevenue, p.annualRevenue);
        fillIfEmpty(existingVendors, setExistingVendors, p.existingVendors);
        fillIfEmpty(managedItems, setManagedItems, p.managedItems);
        fillIfEmpty(storageCondition, setStorageCondition, p.storageCondition);
        fillIfEmpty(logisticsCondition, setLogisticsCondition, p.logisticsCondition);
      }
      // 향후 스케쥴: AI 제안 할일을 기존 입력에 추가
      if (Array.isArray(draft.todos) && draft.todos.length) {
        const aiTodos: TodoRow[] = draft.todos
          .filter((t: any) => t?.dueDate && t?.content)
          .map((t: any) => ({ dueDate: String(t.dueDate).slice(0, 10), content: String(t.content), plan: t.plan ? String(t.plan) : '', custom: true }));
        setTodos((prev) => {
          const meaningful = prev.filter((t) => t.dueDate || t.content.trim() || t.plan.trim());
          const merged = [...meaningful, ...aiTodos];
          return merged.length ? merged : [{ dueDate: '', content: '', plan: '' }];
        });
      }
      setAiNote('Opus 4.8이 비어 있던 항목을 채우고 후속 할일을 제안했습니다. 내용을 검토·수정한 뒤 저장하세요.');
    } catch (e) {
      setAiError((e as Error)?.message || 'AI 자동 작성에 실패했습니다.');
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.listClients();
        setClients(data.clients);
        const params = new URLSearchParams(window.location.search);
        const pre = params.get('clientId');
        if (pre && data.clients.some((c: SalesClient) => c.id === pre)) setClientId(pre);
      } catch (e) {
        console.error('Failed to load clients:', e);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, []);

  const updateReferrer = (i: number, v: string) =>
    setReferrers((r) => r.map((x, idx) => (idx === i ? v : x)));
  const addReferrer = () => setReferrers((r) => [...r, '']);
  const removeReferrer = (i: number) => setReferrers((r) => r.filter((_, idx) => idx !== i));

  const updateTodo = (i: number, key: 'dueDate' | 'content' | 'plan', v: string) =>
    setTodos((t) => t.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const setTodoCustom = (i: number, custom: boolean) =>
    setTodos((t) => t.map((x, idx) => (idx === i ? { ...x, custom, content: '' } : x)));
  const addTodo = () => setTodos((t) => [...t, { dueDate: '', content: '', plan: '' }]);
  const removeTodo = (i: number) => setTodos((t) => t.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!clientId) {
      setError('거래처를 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        clientId,
        title: title.trim() || undefined,
        stage: stage || undefined,
        isFirstMeeting,
        meetingDate: meetingDate || undefined,
        meetingPurpose: meetingPurpose.trim() || undefined,
        meetingLocation: meetingLocation.trim() || undefined,
        attendees: attendees.trim() || undefined,
        meetingSummary: meetingSummary.trim() || undefined,
        keyRequests: keyRequests.trim() || undefined,
        productRequests: productRequests.trim() || undefined,
        referrers: referrers.map((e) => e.trim()).filter(Boolean),
        todos: todos
          .filter((t) => t.dueDate && t.content.trim())
          .map((t) => ({ dueDate: t.dueDate, content: t.content.trim(), plan: t.plan.trim() || undefined })),
        password: password.trim() || undefined,
      };
      if (isFirstMeeting) {
        const profile: Record<string, string> = {};
        if (ownerOrg.trim()) profile.ownerOrg = ownerOrg.trim();
        if (buyerComposition.trim()) profile.buyerComposition = buyerComposition.trim();
        if (annualRevenue.trim()) profile.annualRevenue = annualRevenue.trim();
        if (existingVendors.trim()) profile.existingVendors = existingVendors.trim();
        if (managedItems.trim()) profile.managedItems = managedItems.trim();
        if (storageCondition.trim()) profile.storageCondition = storageCondition.trim();
        if (logisticsCondition.trim()) profile.logisticsCondition = logisticsCondition.trim();
        if (Object.keys(profile).length) {
          try {
            await api.sales.updateClient(clientId, profile);
          } catch (e) {
            console.error('거래처 프로필 저장 실패:', e);
          }
        }
      }
      const res = await api.sales.createJournal(payload);
      const journalId = res.journal.id;
      // 첨부 업로드(실패해도 일지는 저장됨 — 경고만)
      const uploads: Promise<unknown>[] = [
        ...proposalFiles.map((f) => api.sales.uploadJournalAttachment(journalId, f, 'proposal')),
        ...cardFiles.map((f) => api.sales.uploadJournalAttachment(journalId, f, 'card')),
      ];
      if (uploads.length) {
        const results = await Promise.allSettled(uploads);
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed) {
          alert(`영업일지는 저장됐지만 첨부 ${failed}건 업로드에 실패했습니다. 상세 화면에서 다시 첨부해주세요.`);
        }
      }
      router.push(`/sales/${journalId}`);
    } catch (e) {
      setError((e as Error)?.message || '영업일지 작성에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader
        eyebrow="Sales Journal"
        title="새 영업일지"
        description="거래처 미팅 내용·핵심 요청사항·향후 스케쥴을 기록합니다. 참고자와 열람 비밀번호로 접근을 제어할 수 있습니다."
      />

      {loadingClients ? (
        <CenterSpinner label="거래처 불러오는 중" />
      ) : clients.length === 0 ? (
        <Card padding="lg">
          <p className="text-[13px] text-[var(--text-2)]">
            먼저 거래처를 등록해야 영업일지를 작성할 수 있습니다.
          </p>
          <div className="mt-3">
            <Link href="/sales/clients/new">
              <Button variant="primary" size="md">
                + 거래처 등록하기
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-5 max-w-3xl">
          {/* AI 자동 작성 */}
          <Card padding="lg" tone="elevated">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--text-1)]">✦ AI 자동 작성</span>
                  <span className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--text-4)] border border-[var(--border-2)] rounded px-1.5 py-0.5">
                    Opus 4.8
                  </span>
                </div>
                <p className="text-[12.5px] text-[var(--text-3)] mt-1">
                  거래처와 메모 일부만 입력하고 누르면, 비어 있는 항목을 채우고 후속 할일을 제안합니다. (이미 쓴 내용은 보존)
                </p>
                {aiNote && <p className="text-[12px] text-[var(--success-fg)] mt-1.5">{aiNote}</p>}
                {aiError && <p className="text-[12px] text-[var(--danger-fg)] mt-1.5">{aiError}</p>}
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={runAiDraft}
                loading={drafting}
                disabled={!clientId}
                className="flex-shrink-0"
              >
                {drafting ? 'AI 작성 중…' : 'AI로 채우기'}
              </Button>
            </div>
          </Card>

          {/* 기본 */}
          <Card padding="lg">
            <CardHeader title="기본 정보" subtitle="거래처와 영업 단계를 지정합니다." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="거래처" required>
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">거래처 선택</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="제목">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: ○○마트 1차 미팅" />
              </Field>
              <Field label="영업 단계" hint="선택 시 거래처 파이프라인 단계가 함께 갱신됩니다.">
                <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">단계 미지정</option>
                  {SALES_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="최초 미팅 여부">
                <label className="flex items-center gap-2 h-9 text-[13px] text-[var(--text-2)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFirstMeeting}
                    onChange={(e) => setIsFirstMeeting(e.target.checked)}
                    className="w-4 h-4 accent-[var(--brand-500)]"
                  />
                  최초 미팅입니다 (거래처 기본 정보 입력)
                </label>
              </Field>
            </div>
          </Card>

          {/* 최초 미팅 거래처 정보 */}
          {isFirstMeeting && (
            <Card padding="lg">
              <CardHeader
                title="최초 미팅 · 거래처 정보"
                subtitle="거래처 마스터에 저장됩니다 (담당조직·바이어 구성·연매출 등)."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="담당 조직">
                  <Input value={ownerOrg} onChange={(e) => setOwnerOrg(e.target.value)} placeholder="예: 상품본부 베이커리팀" />
                </Field>
                <Field label="바이어 구성">
                  <Input value={buyerComposition} onChange={(e) => setBuyerComposition(e.target.value)} placeholder="예: MD 2인, 카테고리 매니저 1인" />
                </Field>
                <Field label="바이어·거래처 연매출">
                  <Input value={annualRevenue} onChange={(e) => setAnnualRevenue(e.target.value)} placeholder="예: 연 1,200억 / 베이커리 300억" />
                </Field>
                <Field label="기존 거래처">
                  <Input value={existingVendors} onChange={(e) => setExistingVendors(e.target.value)} placeholder="예: A제과, B베이커리" />
                </Field>
                <Field label="관리 품목">
                  <Input value={managedItems} onChange={(e) => setManagedItems(e.target.value)} placeholder="예: 냉장 디저트, 생지" />
                </Field>
                <Field label="보관 조건">
                  <Input value={storageCondition} onChange={(e) => setStorageCondition(e.target.value)} placeholder="예: 냉장(0~10℃)" />
                </Field>
                <Field label="물류 조건" className="sm:col-span-2">
                  <Input value={logisticsCondition} onChange={(e) => setLogisticsCondition(e.target.value)} placeholder="예: 주 3회 냉장 직납, 물류센터 경유" />
                </Field>
              </div>
            </Card>
          )}

          {/* 미팅 정보 */}
          <Card padding="lg">
            <CardHeader title="미팅 정보" subtitle="미팅 목적·장소·참석자·개요" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="미팅 일자">
                <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </Field>
              <Field label="미팅 목적">
                <Input value={meetingPurpose} onChange={(e) => setMeetingPurpose(e.target.value)} placeholder="예: 신제품 입점 제안" />
              </Field>
              <Field label="장소">
                <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} placeholder="예: ○○마트 본사 3층 회의실" />
              </Field>
              <Field label="참석자 정보">
                <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="예: (당사) 홍길동 / (거래처) MD 김철수" />
              </Field>
              <Field label="미팅 개요" className="sm:col-span-2">
                <Textarea value={meetingSummary} onChange={(e) => setMeetingSummary(e.target.value)} placeholder="미팅에서 논의된 내용을 요약합니다." />
              </Field>
            </div>
          </Card>

          {/* 요청/기획 */}
          <Card padding="lg">
            <CardHeader title="요청 · 기획 사항" />
            <div className="grid grid-cols-1 gap-4">
              <Field label="핵심 요청사항">
                <Textarea value={keyRequests} onChange={(e) => setKeyRequests(e.target.value)} placeholder="거래처가 요구한 핵심 사항" />
              </Field>
              <Field label="제품의 구체적 요청 및 기획사항">
                <Textarea value={productRequests} onChange={(e) => setProductRequests(e.target.value)} placeholder="스펙·중량·가격대·시즈널 구성 등 제품 요청/기획" />
              </Field>
            </div>
          </Card>

          {/* 첨부 */}
          <Card padding="lg">
            <CardHeader title="첨부" subtitle="제안서 파일과 거래처 명함을 첨부합니다. 저장 시 함께 업로드됩니다." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-1.5">제안서 파일</div>
                <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px] text-[var(--text-1)] cursor-pointer transition-colors">
                  + 파일 선택
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,image/*"
                    className="hidden"
                    onChange={(e) => {
                      setProposalFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className="text-[11px] text-[var(--text-4)] mt-1">PDF·PPT·Word·Excel·이미지 (최대 25MB)</p>
                <div className="flex flex-col gap-1 mt-2">
                  {proposalFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-2)] bg-[var(--bg-1)] border border-[var(--border-1)] rounded px-2 py-1">
                      <span className="truncate">📄 {f.name}</span>
                      <button
                        type="button"
                        onClick={() => setProposalFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-[var(--text-4)] hover:text-[var(--danger-fg)] flex-shrink-0"
                        aria-label="제거"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-1.5">거래처 명함</div>
                <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px] text-[var(--text-1)] cursor-pointer transition-colors">
                  + 명함 이미지
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      setCardFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className="text-[11px] text-[var(--text-4)] mt-1">명함 사진(PNG·JPG·WebP)</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {cardFiles.map((f, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="w-20 h-14 object-cover rounded border border-[var(--border-1)]"
                      />
                      <button
                        type="button"
                        onClick={() => setCardFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-fg)] text-[11px] flex items-center justify-center"
                        aria-label="제거"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* 참고자 */}
          <Card padding="lg">
            <CardHeader
              title="참고자"
              subtitle="로그인 이메일 기준으로 열람 권한이 부여됩니다."
              actions={
                <Button variant="secondary" size="sm" onClick={addReferrer}>
                  + 참고자 추가
                </Button>
              }
            />
            <div className="flex flex-col gap-2">
              {referrers.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={r}
                    onChange={(e) => updateReferrer(i, e.target.value)}
                    placeholder="referrer@joinandjoin.com"
                  />
                  {referrers.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeReferrer(i)}>
                      삭제
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 향후 스케쥴 */}
          <Card padding="lg">
            <CardHeader
              title="향후 스케쥴 (해야 할 일)"
              subtitle={`일자는 필수. 해야 할 일은 ${stage ? `'${SALES_STAGES.find((s) => s.key === stage)?.label}' 단계` : '영업 단계'} 추천 목록에서 고르거나 '기타'로 직접 입력합니다.`}
              actions={
                <Button variant="secondary" size="sm" onClick={addTodo}>
                  + 항목 추가
                </Button>
              }
            />
            <div className="flex flex-col gap-3">
              {todos.map((t, i) => {
                const suggestions = todoSuggestionsForStage(stage);
                const inList = suggestions.includes(t.content);
                const showCustom = !!t.custom || (!!t.content && !inList);
                return (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 items-start">
                    <Input type="date" value={t.dueDate} onChange={(e) => updateTodo(i, 'dueDate', e.target.value)} />
                    {showCustom ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={t.content}
                          onChange={(e) => updateTodo(i, 'content', e.target.value)}
                          placeholder="해야 할 일 직접 입력"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTodoCustom(i, false)}
                          title="추천 목록에서 선택"
                          className="flex-shrink-0"
                        >
                          목록
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={inList ? t.content : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === TODO_OTHER) setTodoCustom(i, true);
                          else updateTodo(i, 'content', v);
                        }}
                      >
                        <option value="">해야 할 일 선택</option>
                        {suggestions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                        <option value={TODO_OTHER}>기타 (직접 입력)</option>
                      </Select>
                    )}
                    <Input value={t.plan} onChange={(e) => updateTodo(i, 'plan', e.target.value)} placeholder="대략적 계획 (선택)" />
                    {todos.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeTodo(i)}>
                        삭제
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 비밀번호 */}
          <Card padding="lg">
            <CardHeader title="열람 비밀번호 (선택)" subtitle="설정 시 참고자는 비밀번호 입력 후 열람할 수 있습니다. 작성자와 최고관리자는 비밀번호 없이 열람합니다." />
            <div className="max-w-xs">
              <Field label="비밀번호">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="미설정 시 비워두세요" />
              </Field>
            </div>
          </Card>

          {error && <div className="text-[13px] text-[var(--danger-fg)]">{error}</div>}

          <div className="flex items-center gap-2">
            <Button variant="primary" size="md" onClick={submit} loading={submitting}>
              영업일지 저장
            </Button>
            <Link href="/sales">
              <Button variant="ghost" size="md">
                취소
              </Button>
            </Link>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
