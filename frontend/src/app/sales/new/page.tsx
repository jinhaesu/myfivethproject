'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import MeetingPurposeField from '@/components/MeetingPurposeField';
import VoiceJournalRecorder from '@/components/VoiceJournalRecorder';
import { api, getFileUrl } from '@/lib/api';
import {
  SalesClient,
  SalesContact,
  SALES_STAGES,
  STORAGE_CONDITIONS,
  STORAGE_CONDITION_TONE,
  storageLabel,
  todoSuggestionsForStage,
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
  CenterSpinner,
} from '@/components/ui';

interface TodoRow {
  dueDate: string;
  content: string;
  plan: string;
  custom?: boolean; // true면 드롭다운 대신 직접 입력
}

interface QuoteRow {
  productName: string;
  weightSpec: string;
  usp: string;
  flavor: string;
  price: string;
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

  // 첨부(저장 시 일지 생성 후 업로드) — 모두 선택 사항
  const [proposalFiles, setProposalFiles] = useState<File[]>([]);
  const [cardFiles, setCardFiles] = useState<File[]>([]);

  // 과거 입력 장소 (자동완성)
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  // 거래처에 등록된 명함 — 불러오기용
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [pickedContactIds, setPickedContactIds] = useState<string[]>([]);
  const toggleContact = (id: string) =>
    setPickedContactIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // 명함이 0건인 거래처는 일지를 저장할 수 없다 — 화면을 떠나지 않고 여기서 바로 등록한다
  const [quickContact, setQuickContact] = useState({
    name: '', position: '', phone: '', email: '', storageCondition: '',
  });
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState('');
  const needsContact = !!clientId && contactsLoaded && contacts.length === 0;

  const addQuickContact = async () => {
    if (!quickContact.name.trim() || !quickContact.storageCondition) return;
    setQuickBusy(true);
    setQuickError('');
    try {
      await api.sales.createContact(clientId, {
        name: quickContact.name.trim(),
        position: quickContact.position.trim() || undefined,
        phone: quickContact.phone.trim() || undefined,
        email: quickContact.email.trim() || undefined,
        storageCondition: quickContact.storageCondition,
      });
      const data = await api.sales.listContacts(clientId);
      setContacts(data.contacts || []);
      setQuickContact({ name: '', position: '', phone: '', email: '', storageCondition: '' });
    } catch (e) {
      setQuickError((e as Error)?.message || '담당자 등록에 실패했습니다.');
    } finally {
      setQuickBusy(false);
    }
  };

  // 샘플 제공 + 견적 제안 그리드
  const [sampleProvided, setSampleProvided] = useState(false);
  const [hasQuote, setHasQuote] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteRow[]>([
    { productName: '', weightSpec: '', usp: '', flavor: '', price: '' },
  ]);
  const updateQuote = (i: number, key: keyof QuoteRow, v: string) =>
    setQuoteItems((q) => q.map((x, idx) => (idx === i ? { ...x, [key]: v } : x)));
  const addQuote = () =>
    setQuoteItems((q) => [...q, { productName: '', weightSpec: '', usp: '', flavor: '', price: '' }]);
  const removeQuote = (i: number) => setQuoteItems((q) => q.filter((_, idx) => idx !== i));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // AI 자동 작성 (Opus 4.8)
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNote, setAiNote] = useState('');
  // 음성 받아쓰기 원문 — AI 정리본과 함께 저장해 나중에 대조할 수 있게 한다
  const [voiceTranscript, setVoiceTranscript] = useState('');

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
        transcript: voiceTranscript.trim() || undefined,
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
      setAiNote(
        voiceTranscript.trim()
          ? '음성 원문을 바탕으로 Opus 4.8이 일지를 정리했습니다. 받아쓰기는 고유명사·숫자를 자주 틀리니 반드시 검토한 뒤 저장하세요.'
          : 'Opus 4.8이 비어 있던 항목을 채우고 후속 할일을 제안했습니다. 내용을 검토·수정한 뒤 저장하세요.',
      );
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
    // 과거 장소 자동완성 목록
    (async () => {
      try {
        const data = await api.sales.locations();
        setLocationOptions(data.locations || []);
      } catch (e) {
        console.error('Failed to load locations:', e);
      }
    })();
  }, []);

  // 거래처가 바뀌면 등록된 명함 목록을 다시 불러온다
  useEffect(() => {
    setPickedContactIds([]);
    setContactsLoaded(false);
    if (!clientId) {
      setContacts([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const data = await api.sales.listContacts(clientId);
        if (alive) setContacts(data.contacts || []);
      } catch (e) {
        console.error('Failed to load contacts:', e);
        if (alive) setContacts([]);
      } finally {
        // 조회를 마치기 전에는 "명함 없음"으로 단정하지 않는다
        if (alive) setContactsLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

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

  // 필수 항목 검사 — 체크박스(최초미팅·샘플·견적)와 참고자, 열람 비밀번호는 제외
  const validate = (): string => {
    const required: [string, string][] = [
      [clientId, '거래처'],
      [title, '제목'],
      [stage, '영업 단계'],
      [meetingDate, '미팅 일자'],
      [meetingPurpose, '미팅 목적'],
      [meetingLocation, '장소'],
      [attendees, '참석자 정보'],
      [meetingSummary, '미팅 개요'],
      [keyRequests, '핵심 요청사항'],
      [productRequests, '제품의 구체적 요청 및 기획사항'],
    ];
    const missing = required.filter(([v]) => !v.trim()).map(([, label]) => label);
    if (isFirstMeeting) {
      const profile: [string, string][] = [
        [ownerOrg, '담당 조직'],
        [buyerComposition, '바이어 구성'],
        [annualRevenue, '바이어·거래처 연매출'],
        [existingVendors, '기존 거래처'],
        [managedItems, '관리 품목'],
        [storageCondition, '보관 조건'],
        [logisticsCondition, '물류 조건'],
      ];
      missing.push(...profile.filter(([v]) => !v.trim()).map(([, label]) => label));
    }
    if (!todos.some((t) => t.dueDate && t.content.trim())) {
      missing.push('향후 스케쥴 (일자 + 해야 할 일 1건 이상)');
    }
    if (hasQuote && !quoteItems.some((q) => q.productName.trim())) {
      missing.push('견적 항목 (제품명 1건 이상)');
    }
    if (missing.length) return `필수 항목을 입력해주세요: ${missing.join(', ')}`;
    // 서버도 같은 규칙으로 막지만, 다 쓰고 저장 버튼에서 튕기는 것보다 먼저 알려준다
    if (needsContact) {
      const clientName = clients.find((c) => c.id === clientId)?.name || '이 거래처';
      return `${clientName}에 등록된 담당자 명함이 없습니다. 기본 정보의 담당자 등록을 먼저 완료해주세요.`;
    }
    return '';
  };

  const submit = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        voiceTranscript: voiceTranscript.trim() || undefined,
        sampleProvided,
        hasQuote,
        quoteItems: hasQuote
          ? quoteItems
              .filter((q) => q.productName.trim())
              .map((q) => ({
                productName: q.productName.trim(),
                weightSpec: q.weightSpec.trim() || undefined,
                usp: q.usp.trim() || undefined,
                flavor: q.flavor.trim() || undefined,
                price: q.price.trim() || undefined,
              }))
          : [],
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
        // 거래처에 이미 등록된 명함은 파일 재업로드 없이 참조로 연결
        ...pickedContactIds.map((cid) => api.sales.attachContactCard(journalId, cid)),
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

            <div className="mt-3">
              <VoiceJournalRecorder
                transcript={voiceTranscript}
                onTranscriptChange={setVoiceTranscript}
                onApply={runAiDraft}
                applying={drafting}
                disabled={!clientId}
                disabledReason={!clientId ? '거래처를 먼저 선택해주세요.' : ''}
              />
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
              <Field label="제목" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: ○○마트 1차 미팅" />
              </Field>
              <Field label="영업 단계" required hint="선택 시 거래처 파이프라인 단계가 함께 갱신됩니다.">
                <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">영업 단계 선택</option>
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

            {/* 명함 0건 거래처 — 일지 저장 전에 담당자를 특정해 둔다 */}
            {needsContact && (
              <div className="mt-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3">
                <div className="text-[12.5px] font-medium text-[var(--danger-fg)]">
                  이 거래처는 등록된 담당자 명함이 없습니다
                </div>
                <p className="text-[11.5px] text-[var(--text-2)] mt-1 mb-2.5">
                  담당자 1명을 등록해야 영업일지를 저장할 수 있습니다. 여기서 바로 등록하면 거래처 마스터에도 함께 저장됩니다.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    inputSize="sm"
                    placeholder="담당자명 *"
                    value={quickContact.name}
                    onChange={(e) => setQuickContact({ ...quickContact, name: e.target.value })}
                  />
                  <Select
                    inputSize="sm"
                    value={quickContact.storageCondition}
                    onChange={(e) => setQuickContact({ ...quickContact, storageCondition: e.target.value })}
                  >
                    <option value="">보관 조건 * (냉동/냉장/상온/전체)</option>
                    {STORAGE_CONDITIONS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    inputSize="sm"
                    placeholder="직급·직함"
                    value={quickContact.position}
                    onChange={(e) => setQuickContact({ ...quickContact, position: e.target.value })}
                  />
                  <Input
                    inputSize="sm"
                    placeholder="연락처"
                    value={quickContact.phone}
                    onChange={(e) => setQuickContact({ ...quickContact, phone: e.target.value })}
                  />
                  <Input
                    inputSize="sm"
                    placeholder="이메일"
                    value={quickContact.email}
                    onChange={(e) => setQuickContact({ ...quickContact, email: e.target.value })}
                    className="sm:col-span-2"
                  />
                </div>
                {quickError && (
                  <div className="mt-2 text-[11.5px] text-[var(--danger-fg)]">{quickError}</div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addQuickContact}
                    loading={quickBusy}
                    disabled={!quickContact.name.trim() || !quickContact.storageCondition}
                  >
                    + 담당자 등록
                  </Button>
                  <span className="text-[11px] text-[var(--text-4)]">
                    명함 이미지는 거래처 상세에서 첨부할 수 있습니다.
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* 최초 미팅 거래처 정보 */}
          {isFirstMeeting && (
            <Card padding="lg">
              <CardHeader
                title="최초 미팅 · 거래처 정보"
                subtitle="최초 미팅에서는 모두 필수입니다. 거래처 마스터에 저장됩니다."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="담당 조직" required>
                  <Input value={ownerOrg} onChange={(e) => setOwnerOrg(e.target.value)} placeholder="예: 상품본부 베이커리팀" />
                </Field>
                <Field label="바이어 구성" required>
                  <Input value={buyerComposition} onChange={(e) => setBuyerComposition(e.target.value)} placeholder="예: MD 2인, 카테고리 매니저 1인" />
                </Field>
                <Field label="바이어·거래처 연매출" required>
                  <Input value={annualRevenue} onChange={(e) => setAnnualRevenue(e.target.value)} placeholder="예: 연 1,200억 / 베이커리 300억" />
                </Field>
                <Field label="기존 거래처" required>
                  <Input value={existingVendors} onChange={(e) => setExistingVendors(e.target.value)} placeholder="예: A제과, B베이커리" />
                </Field>
                <Field label="관리 품목" required>
                  <Input value={managedItems} onChange={(e) => setManagedItems(e.target.value)} placeholder="예: 냉장 디저트, 생지" />
                </Field>
                <Field label="보관 조건" required>
                  <Input value={storageCondition} onChange={(e) => setStorageCondition(e.target.value)} placeholder="예: 냉장(0~10℃)" />
                </Field>
                <Field label="물류 조건" required className="sm:col-span-2">
                  <Input value={logisticsCondition} onChange={(e) => setLogisticsCondition(e.target.value)} placeholder="예: 주 3회 냉장 직납, 물류센터 경유" />
                </Field>
              </div>
            </Card>
          )}

          {/* 미팅 정보 */}
          <Card padding="lg">
            <CardHeader title="미팅 정보" subtitle="미팅 목적·장소·참석자·개요" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="미팅 일자" required>
                <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </Field>
              <MeetingPurposeField value={meetingPurpose} onChange={setMeetingPurpose} />
              <Field label="장소" required hint="과거에 입력한 장소를 자동완성으로 고를 수 있습니다.">
                <Input
                  value={meetingLocation}
                  onChange={(e) => setMeetingLocation(e.target.value)}
                  placeholder="예: ○○마트 본사 3층 회의실"
                  list="journal-location-list"
                />
                <datalist id="journal-location-list">
                  {locationOptions.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </Field>
              <Field label="참석자 정보" required>
                <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="예: (당사) 홍길동 / (거래처) MD 김철수" />
              </Field>
              <Field label="미팅 개요" required className="sm:col-span-2">
                <Textarea value={meetingSummary} onChange={(e) => setMeetingSummary(e.target.value)} placeholder="미팅에서 논의된 내용을 요약합니다." />
              </Field>
            </div>
          </Card>

          {/* 요청/기획 */}
          <Card padding="lg">
            <CardHeader title="요청 · 기획 사항" />
            <div className="grid grid-cols-1 gap-4">
              <Field label="핵심 요청사항" required>
                <Textarea value={keyRequests} onChange={(e) => setKeyRequests(e.target.value)} placeholder="거래처가 요구한 핵심 사항" />
              </Field>
              <Field label="제품의 구체적 요청 및 기획사항" required>
                <Textarea value={productRequests} onChange={(e) => setProductRequests(e.target.value)} placeholder="스펙·중량·가격대·시즈널 구성 등 제품 요청/기획" />
              </Field>
            </div>
          </Card>

          {/* 견적 · 샘플 */}
          <Card padding="lg">
            <CardHeader
              title="견적 · 샘플"
              subtitle="견적을 제안한 경우 제품별로 기록하고, 샘플 제공 여부를 체크합니다."
            />
            <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)] cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={sampleProvided}
                onChange={(e) => setSampleProvided(e.target.checked)}
                className="w-4 h-4 accent-[var(--brand-500)]"
              />
              샘플 제공함
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[var(--text-2)] cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={hasQuote}
                onChange={(e) => setHasQuote(e.target.checked)}
                className="w-4 h-4 accent-[var(--brand-500)]"
              />
              견적 제안 있음 (아래 표에 기록)
            </label>

            {hasQuote && (
              <div className="mt-3">
                {/* 헤더 */}
                <div className="hidden sm:grid grid-cols-[1.4fr_0.9fr_1.2fr_0.9fr_1fr_auto] gap-2 px-1 pb-1.5 text-[11px] text-[var(--text-3)]">
                  <span>제품명</span>
                  <span>중량</span>
                  <span>USP</span>
                  <span>맛</span>
                  <span>제안가격</span>
                  <span />
                </div>
                {/* 모바일에서는 헤더 행이 없으므로 각 입력 위에 라벨을 붙이고 행을 카드로 구분한다 */}
                <div className="flex flex-col gap-2">
                  {quoteItems.map((q, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.9fr_1.2fr_0.9fr_1fr_auto] gap-2 items-start rounded-md border border-[var(--border-1)] p-3 sm:border-0 sm:p-0"
                    >
                      <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">제품명 {i + 1}</span>
                      <Input value={q.productName} onChange={(e) => updateQuote(i, 'productName', e.target.value)} placeholder="제품명" />
                      <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">중량</span>
                      <Input value={q.weightSpec} onChange={(e) => updateQuote(i, 'weightSpec', e.target.value)} placeholder="예: 80g" />
                      <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">USP</span>
                      <Input value={q.usp} onChange={(e) => updateQuote(i, 'usp', e.target.value)} placeholder="예: 고단백" />
                      <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">맛</span>
                      <Input value={q.flavor} onChange={(e) => updateQuote(i, 'flavor', e.target.value)} placeholder="예: 초코" />
                      <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">제안가격</span>
                      <Input value={q.price} onChange={(e) => updateQuote(i, 'price', e.target.value)} placeholder="예: 개당 1,200원" />
                      {quoteItems.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeQuote(i)}>
                          삭제
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Button variant="secondary" size="sm" onClick={addQuote}>
                    + 견적 항목 추가
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* 첨부 */}
          <Card padding="lg">
            <CardHeader title="첨부 (선택)" subtitle="제안서와 명함은 필수가 아닙니다. 저장 시 함께 업로드됩니다." />

            {/* 거래처에 이미 등록된 명함 불러오기 */}
            {contacts.length > 0 && (
              <div className="mb-5">
                <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-1.5">
                  등록된 명함 불러오기
                </div>
                <p className="text-[11px] text-[var(--text-4)] mb-2">
                  이 거래처에 등록된 담당자 명함을 새로 찍지 않고 그대로 붙일 수 있습니다. 보관 조건으로 담당 구분을 확인하세요.
                </p>
                <div className="flex flex-col gap-1.5">
                  {contacts.map((c) => {
                    const picked = pickedContactIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={
                          'flex items-center gap-3 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ' +
                          (picked
                            ? 'border-[var(--brand-500)] bg-[var(--bg-2)]'
                            : 'border-[var(--border-1)] bg-[var(--bg-1)] hover:bg-[var(--bg-2)]')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => toggleContact(c.id)}
                          disabled={!c.cardImageUrl}
                          className="w-4 h-4 accent-[var(--brand-500)] disabled:opacity-40"
                        />
                        {c.cardImageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={getFileUrl(c.cardImageUrl)}
                            alt={c.name}
                            className="w-16 h-11 object-cover rounded border border-[var(--border-1)] flex-shrink-0"
                          />
                        ) : (
                          <span className="w-16 h-11 rounded border border-dashed border-[var(--border-2)] flex items-center justify-center text-[10px] text-[var(--text-4)] flex-shrink-0">
                            명함 없음
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-1)]">
                            <span className="truncate">
                              {c.name}
                              {c.position ? ` ${c.position}` : ''}
                            </span>
                            <Badge
                              tone={
                                c.storageCondition
                                  ? STORAGE_CONDITION_TONE[c.storageCondition] || 'neutral'
                                  : 'neutral'
                              }
                              size="xs"
                            >
                              {storageLabel(c.storageCondition)}
                            </Badge>
                          </span>
                          <span className="block text-[11px] text-[var(--text-3)] truncate">
                            {[c.title, c.phone, c.email].filter(Boolean).join(' · ') || '연락처 미등록'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-1.5">제안서 파일 (선택)</div>
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
                <div className="text-[12.5px] font-medium text-[var(--text-2)] mb-1.5">새 명함 이미지 (선택)</div>
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
              title="향후 스케쥴 (해야 할 일) *"
              subtitle={`최소 1건은 필수입니다. 해야 할 일은 ${stage ? `'${SALES_STAGES.find((s) => s.key === stage)?.label}' 단계` : '영업 단계'} 추천 목록에서 고르거나 '기타'로 직접 입력합니다.`}
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
                  <div
                    key={i}
                    className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 items-start rounded-md border border-[var(--border-1)] p-3 sm:border-0 sm:p-0"
                  >
                    <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">기한</span>
                    <Input type="date" value={t.dueDate} onChange={(e) => updateTodo(i, 'dueDate', e.target.value)} />
                    <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">해야 할 일</span>
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
                    <span className="sm:hidden text-[11px] text-[var(--text-3)] -mb-1">대략적 계획 (선택)</span>
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

          <div className="flex flex-wrap items-center gap-2">
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
