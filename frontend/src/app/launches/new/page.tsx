'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import {
  PRODUCT_TYPES,
  BRAND_TYPES,
  STORAGE_CONDITIONS,
  USP_OPTIONS,
  LAUNCH_SCOPES,
  LaunchProject,
} from '@/lib/launch';
import { SalesClient } from '@/lib/sales';
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

interface TemplateStage {
  name: string;
  department: string;
  tasks: Array<{ name: string; checkPoint: string }>;
}

interface StageOwnerInput {
  ownerName: string;
  ownerEmail: string;
  department: string;
  dueDate: string;
}

function NewLaunchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copyFromId = searchParams.get('from');

  const [template, setTemplate] = useState<TemplateStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copiedFrom, setCopiedFrom] = useState('');

  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [weightSpec, setWeightSpec] = useState('');
  const [description, setDescription] = useState('');
  const [targetLaunchDate, setTargetLaunchDate] = useState('');
  const [brandType, setBrandType] = useState('');
  // 출시 대상 구분 — 거래처 전용일 때만 clientId를 받는다
  const [launchScope, setLaunchScope] = useState('brand');
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [salesChannels, setSalesChannels] = useState('');
  const [storageCondition, setStorageCondition] = useState('');
  const [usp, setUsp] = useState<string[]>([]);
  const [uspEtc, setUspEtc] = useState('');
  const [targetShelfLife, setTargetShelfLife] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [owners, setOwners] = useState<StageOwnerInput[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.launches.getTemplate('launch');
        const tmpl: TemplateStage[] = data.template;
        setTemplate(tmpl);

        let base: StageOwnerInput[] = tmpl.map((s) => ({
          ownerName: '',
          ownerEmail: '',
          department: s.department,
          dueDate: '',
        }));

        // 프로젝트 복사: 기존 프로젝트의 제품·전략·단계 담당 정보를 프리필 (마감일은 새로 입력)
        if (copyFromId) {
          try {
            const src = await api.launches.get(copyFromId);
            const p: LaunchProject = src.project;
            setProductName(`${p.productName} (복사)`);
            if (p.productType) setProductType(p.productType);
            setWeightSpec(p.weightSpec || '');
            setDescription(p.description || '');
            setBrandType(p.brandType || '');
            setLaunchScope(p.launchScope || 'brand');
            setClientId(p.clientId || '');
            setSalesChannels(p.salesChannels || '');
            setStorageCondition(p.storageCondition || '');
            const srcUsp = p.usp || [];
            setUsp(srcUsp.filter((u) => USP_OPTIONS.includes(u)));
            setUspEtc(srcUsp.filter((u) => !USP_OPTIONS.includes(u)).join(', '));
            setTargetShelfLife(p.targetShelfLife || '');
            base = tmpl.map((s, idx) => {
              const srcStage = p.stages.find((st) => st.sortOrder === idx);
              return {
                ownerName: srcStage?.ownerName || '',
                ownerEmail: srcStage?.ownerEmail || '',
                department: srcStage?.department || s.department,
                dueDate: '',
              };
            });
            setCopiedFrom(p.productName);
          } catch (err) {
            console.error('Failed to copy project:', err);
          }
        }
        setOwners(base);
      } catch (err) {
        console.error('Failed to fetch launch template:', err);
        setError('단계 템플릿을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyFromId]);

  // 거래처 전용 출시를 고를 때 쓰는 목록
  useEffect(() => {
    (async () => {
      try {
        const data = await api.sales.listClients();
        setClients(data.clients || []);
      } catch (err) {
        console.error('Failed to fetch clients:', err);
      }
    })();
  }, []);

  const setOwner = (idx: number, patch: Partial<StageOwnerInput>) => {
    setOwners((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const toggleUsp = (option: string) => {
    setUsp((prev) => (prev.includes(option) ? prev.filter((u) => u !== option) : [...prev, option]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError('제품명을 입력해주세요.');
      return;
    }
    if (launchScope === 'client' && !clientId) {
      setError('거래처 전용 출시는 대상 거래처를 선택해주세요.');
      return;
    }
    const missing = template
      .map((s, idx) => {
        const o = owners[idx];
        const lacks = [];
        if (!o?.ownerName.trim()) lacks.push('담당자 이름');
        if (!o?.ownerEmail.trim()) lacks.push('담당자 이메일');
        if (!o?.dueDate) lacks.push('마감일');
        return lacks.length > 0 ? `${s.name}: ${lacks.join('·')}` : null;
      })
      .filter(Boolean);
    if (missing.length > 0) {
      setError(`모든 단계에 담당자와 마감일을 지정해야 합니다.\n${missing.join(' / ')}`);
      return;
    }

    const uspAll = [...usp, ...uspEtc.split(',').map((s) => s.trim()).filter(Boolean)];

    try {
      setSubmitting(true);
      setError('');
      const data = await api.launches.create({
        productName: productName.trim(),
        productType,
        weightSpec: weightSpec.trim() || undefined,
        description: description.trim() || undefined,
        targetLaunchDate: targetLaunchDate || undefined,
        brandType: brandType || undefined,
        launchScope,
        clientId: launchScope === 'client' ? clientId : undefined,
        salesChannels: salesChannels.trim() || undefined,
        storageCondition: storageCondition || undefined,
        usp: uspAll.length > 0 ? uspAll : undefined,
        targetShelfLife: targetShelfLife.trim() || undefined,
        editPassword: editPassword.trim() || undefined,
        stageOwners: owners.map((o, idx) => ({
          sortOrder: idx,
          ownerName: o.ownerName.trim(),
          ownerEmail: o.ownerEmail.trim(),
          department: o.department.trim() || undefined,
          dueDate: o.dueDate,
        })),
      });
      router.push(`/launches/${data.project.id}`);
    } catch (err: any) {
      setError(err.message || '출시 프로젝트 생성에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Launch Operations"
        title="새 출시 프로젝트"
        description="제과·제빵 출시 템플릿(9단계: 기획→배합개발→구매·원가→인허가·표시→포장→영업채널검수→생산준비→품질검증→출시)으로 단계별 업무·체크리스트가 자동 생성됩니다. 모든 단계의 담당자·마감일 지정이 필수입니다."
      />

      {copiedFrom && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[var(--info-bg)] border border-[var(--info-border)] text-[13px] text-[var(--info-fg)]">
          「{copiedFrom}」 프로젝트를 복사했습니다. 제품 정보·전략·단계 담당자가 채워졌으니 출시일과 단계 마감일만 새로 지정하세요.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[13px] text-[var(--danger-fg)] whitespace-pre-wrap">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card padding="lg">
          <CardHeader title="제품 정보" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="제품명" required>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="예: 통밀 카스테라"
                inputSize="md"
              />
            </Field>
            <Field label="제품 유형">
              <Select value={productType} onChange={(e) => setProductType(e.target.value)} inputSize="md">
                {PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="중량 / 규격" hint="샘플 요청 시 자동으로 채워집니다">
              <Input
                value={weightSpec}
                onChange={(e) => setWeightSpec(e.target.value)}
                placeholder="예: 개당 80g, 4입 트레이 포장"
                inputSize="md"
              />
            </Field>
            <Field label="출시 예정일" hint="설정 시 D-30/14/7/3/1/D-DAY에 담당자 전원 자동 알림">
              <Input
                type="date"
                value={targetLaunchDate}
                onChange={(e) => setTargetLaunchDate(e.target.value)}
                inputSize="md"
              />
            </Field>
            <Field label="설명">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="제품 컨셉, 목표 등"
                rows={2}
              />
            </Field>
            <Field
              label="편집 비밀번호 (선택)"
              hint="설정하면 이후 이 프로젝트 수정 시 비밀번호가 필요합니다. 빈칸이면 잠금 없이 누구나 수정 가능."
              className="sm:col-span-2"
            >
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="비워두면 잠금 없음"
                inputSize="md"
                autoComplete="new-password"
              />
            </Field>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader
            title="출시 전략"
            subtitle="브랜드 유형·영업채널·보관조건·USP·타겟 소비기한 — 단계 알림과 샘플 요청 메일에 자동 포함됩니다."
          />
          {/* 출시 대상 구분 — 이후 거래처 화면에 뜰지 말지가 여기서 갈린다 */}
          <div className="mb-4">
            <div className="text-[13px] font-medium text-[var(--text-1)] mb-2">출시 대상 구분</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LAUNCH_SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setLaunchScope(s.key)}
                  className={
                    'text-left rounded-lg border p-3 transition-colors ' +
                    (launchScope === s.key
                      ? 'border-[var(--brand-500)] bg-[var(--bg-2)]'
                      : 'border-[var(--border-1)] hover:bg-[var(--bg-2)]')
                  }
                >
                  <div className="text-[13px] font-medium text-[var(--text-1)]">{s.label}</div>
                  <div className="text-[11.5px] text-[var(--text-3)] mt-0.5">{s.hint}</div>
                </button>
              ))}
            </div>
            {launchScope === 'client' && (
              <div className="mt-3">
                <Field
                  label="대상 거래처"
                  required
                  hint="이 거래처 상세 화면과 영업 캘린더 거래처 필터에 이 제품이 함께 표시됩니다."
                >
                  <Select value={clientId} onChange={(e) => setClientId(e.target.value)} inputSize="md">
                    <option value="">거래처 선택</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="브랜드 유형">
              <Select value={brandType} onChange={(e) => setBrandType(e.target.value)} inputSize="md">
                <option value="">선택…</option>
                {BRAND_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="영업채널" hint="쉼표로 구분해 여러 채널 입력">
              <Input
                value={salesChannels}
                onChange={(e) => setSalesChannels(e.target.value)}
                placeholder="예: 자사몰, 쿠팡 로켓프레시, ○○마트 PB"
                inputSize="md"
              />
            </Field>
            <Field label="보관 조건">
              <Select
                value={storageCondition}
                onChange={(e) => setStorageCondition(e.target.value)}
                inputSize="md"
              >
                <option value="">선택…</option>
                {STORAGE_CONDITIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="타겟 소비기한">
              <Input
                value={targetShelfLife}
                onChange={(e) => setTargetShelfLife(e.target.value)}
                placeholder="예: 냉장 30일 / 실온 6개월"
                inputSize="md"
              />
            </Field>
            <Field label="USP (복수 선택)" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {USP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleUsp(option)}
                    className={
                      usp.includes(option)
                        ? 'px-2.5 py-1 rounded-full text-[12px] bg-[var(--brand-500)] text-white border border-[var(--brand-500)] transition-colors'
                        : 'px-2.5 py-1 rounded-full text-[12px] text-[var(--text-3)] border border-[var(--border-2)] hover:border-[var(--brand-500)] hover:text-[var(--text-1)] transition-colors'
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
              <Input
                value={uspEtc}
                onChange={(e) => setUspEtc(e.target.value)}
                placeholder="기타 USP (쉼표 구분)"
                inputSize="sm"
                className="mt-2"
              />
            </Field>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader
            title="단계별 담당 지정 (필수)"
            subtitle="모든 단계에 담당자 이름·이메일·마감일을 지정해야 프로젝트를 생성할 수 있습니다. 단계 시작 시 체크리스트가 포함된 알림 메일이 발송됩니다."
          />
          {loading ? (
            <CenterSpinner label="템플릿 불러오는 중" />
          ) : (
            <div className="space-y-3">
              {template.map((stage, idx) => (
                <div
                  key={stage.name}
                  className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-1)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[13px] font-semibold text-[var(--text-1)]">{stage.name}</span>
                    <Badge tone="neutral" size="xs">
                      체크리스트 {stage.tasks.length}건
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <Field label="담당 부서">
                      <Input
                        value={owners[idx]?.department ?? stage.department}
                        onChange={(e) => setOwner(idx, { department: e.target.value })}
                        inputSize="sm"
                      />
                    </Field>
                    <Field label="담당자 이름" required>
                      <Input
                        value={owners[idx]?.ownerName ?? ''}
                        onChange={(e) => setOwner(idx, { ownerName: e.target.value })}
                        placeholder="홍길동"
                        inputSize="sm"
                        invalid={!!error && !owners[idx]?.ownerName.trim()}
                      />
                    </Field>
                    <Field label="담당자 이메일" required>
                      <Input
                        type="email"
                        value={owners[idx]?.ownerEmail ?? ''}
                        onChange={(e) => setOwner(idx, { ownerEmail: e.target.value })}
                        placeholder="user@joinandjoin.com"
                        inputSize="sm"
                        invalid={!!error && !owners[idx]?.ownerEmail.trim()}
                      />
                    </Field>
                    <Field label="단계 마감일" required>
                      <Input
                        type="date"
                        value={owners[idx]?.dueDate ?? ''}
                        onChange={(e) => setOwner(idx, { dueDate: e.target.value })}
                        inputSize="sm"
                        invalid={!!error && !owners[idx]?.dueDate}
                      />
                    </Field>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11.5px] text-[var(--text-3)] hover:text-[var(--text-1)]">
                      체크리스트 미리보기
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {stage.tasks.map((t) => (
                        <li key={t.name} className="text-[12px] text-[var(--text-3)]">
                          <span className="text-[var(--text-2)]">• {t.name}</span>
                          <span className="text-[var(--text-4)]"> — {t.checkPoint}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={() => router.push('/launches')}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting || loading}>
            {submitting ? '생성 중…' : '출시 프로젝트 생성'}
          </Button>
        </div>
      </form>
    </>
  );
}

export default function NewLaunchPage() {
  return (
    <AppLayout>
      <Suspense fallback={<CenterSpinner label="로딩 중" />}>
        <NewLaunchForm />
      </Suspense>
    </AppLayout>
  );
}
