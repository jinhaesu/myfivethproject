'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PRODUCT_TYPES, DISCONTINUE_REASONS, LaunchProject } from '@/lib/launch';
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

function NewDiscontinuationForm() {
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
  const [discontinueReason, setDiscontinueReason] = useState(DISCONTINUE_REASONS[0]);
  const [description, setDescription] = useState('');
  const [targetLaunchDate, setTargetLaunchDate] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [owners, setOwners] = useState<StageOwnerInput[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.launches.getTemplate('discontinuation');
        const tmpl: TemplateStage[] = data.template;
        setTemplate(tmpl);

        let base: StageOwnerInput[] = tmpl.map((s) => ({
          ownerName: '',
          ownerEmail: '',
          department: s.department,
          dueDate: '',
        }));

        // 단종할 출시 제품(또는 기존 단종 프로젝트)에서 제품 정보·담당자 프리필
        if (copyFromId) {
          try {
            const src = await api.launches.get(copyFromId);
            const p: LaunchProject = src.project;
            setProductName(p.productName);
            if (p.productType) setProductType(p.productType);
            setWeightSpec(p.weightSpec || '');
            if (p.discontinueReason) setDiscontinueReason(p.discontinueReason);
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
        console.error('Failed to fetch template:', err);
        setError('단계 템플릿을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyFromId]);

  const setOwner = (idx: number, patch: Partial<StageOwnerInput>) => {
    setOwners((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError('제품명을 입력해주세요.');
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

    try {
      setSubmitting(true);
      setError('');
      const data = await api.launches.create({
        kind: 'discontinuation',
        productName: productName.trim(),
        productType,
        weightSpec: weightSpec.trim() || undefined,
        discontinueReason,
        description: description.trim() || undefined,
        targetLaunchDate: targetLaunchDate || undefined,
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
      setError(err.message || '단종 프로젝트 생성에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Discontinuation Operations"
        title="새 단종 프로젝트"
        description="단종 템플릿(5단계: 결정·사유→재고 소진→채널·거래처 정리→표시·인허가 정리→정산·마감)으로 단계별 업무·체크리스트가 자동 생성됩니다. 모든 단계의 담당자·마감일 지정이 필수입니다."
      />

      {copiedFrom && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[var(--info-bg)] border border-[var(--info-border)] text-[13px] text-[var(--info-fg)]">
          「{copiedFrom}」 제품 정보를 가져왔습니다. 단종 사유·목표일과 단계 마감일을 지정하세요.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[13px] text-[var(--danger-fg)] whitespace-pre-wrap">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card padding="lg">
          <CardHeader title="단종 대상 제품" />
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
            <Field label="단종 사유" required>
              <Select
                value={discontinueReason}
                onChange={(e) => setDiscontinueReason(e.target.value)}
                inputSize="md"
              >
                {DISCONTINUE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="중량 / 규격">
              <Input
                value={weightSpec}
                onChange={(e) => setWeightSpec(e.target.value)}
                placeholder="예: 개당 80g, 4입 트레이 포장"
                inputSize="md"
              />
            </Field>
            <Field label="단종 목표일" hint="설정 시 D-30/14/7/3/1/D-DAY에 담당자 전원 자동 알림">
              <Input
                type="date"
                value={targetLaunchDate}
                onChange={(e) => setTargetLaunchDate(e.target.value)}
                inputSize="md"
              />
            </Field>
            <Field label="상세 설명" className="sm:col-span-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="단종 배경, 품질 이슈 상세, 대체 제품 정보 등"
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
            title="단계별 담당 지정 (필수)"
            subtitle="모든 단계에 담당자 이름·이메일·마감일을 지정해야 합니다. 단계 시작 시 체크리스트가 포함된 알림 메일이 발송됩니다. (재고 소진 계획은 영업·생산 협업)"
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
          <Button type="button" variant="ghost" size="md" onClick={() => router.push('/discontinuations')}>
            취소
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={submitting || loading}>
            {submitting ? '생성 중…' : '단종 프로젝트 생성'}
          </Button>
        </div>
      </form>
    </>
  );
}

export default function NewDiscontinuationPage() {
  return (
    <AppLayout>
      <Suspense fallback={<CenterSpinner label="로딩 중" />}>
        <NewDiscontinuationForm />
      </Suspense>
    </AppLayout>
  );
}
