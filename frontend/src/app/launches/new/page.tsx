'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PRODUCT_TYPES } from '@/lib/launch';
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

export default function NewLaunchPage() {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateStage[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState(PRODUCT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [targetLaunchDate, setTargetLaunchDate] = useState('');
  const [owners, setOwners] = useState<StageOwnerInput[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.launches.getTemplate();
        setTemplate(data.template);
        setOwners(
          data.template.map((s: TemplateStage) => ({
            ownerName: '',
            ownerEmail: '',
            department: s.department,
            dueDate: '',
          }))
        );
      } catch (err) {
        console.error('Failed to fetch launch template:', err);
        setError('단계 템플릿을 불러오지 못했습니다.');
      } finally {
        setLoadingTemplate(false);
      }
    })();
  }, []);

  const setOwner = (idx: number, patch: Partial<StageOwnerInput>) => {
    setOwners((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError('제품명을 입력해주세요.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const data = await api.launches.create({
        productName: productName.trim(),
        productType,
        description: description.trim() || undefined,
        targetLaunchDate: targetLaunchDate || undefined,
        stageOwners: owners.map((o, idx) => ({
          sortOrder: idx,
          ownerName: o.ownerName.trim() || undefined,
          ownerEmail: o.ownerEmail.trim() || undefined,
          department: o.department.trim() || undefined,
          dueDate: o.dueDate || undefined,
        })),
      });
      router.push(`/launches/${data.project.id}`);
    } catch (err: any) {
      setError(err.message || '출시 프로젝트 생성에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Launch Operations"
        title="새 출시 프로젝트"
        description="제과·제빵 출시 템플릿(7단계)으로 단계별 업무·체크리스트가 자동 생성됩니다."
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[13px] text-[var(--danger-fg)]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card padding="lg">
          <CardHeader title="제품 정보" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="제품명 *">
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
            <Field label="출시 예정일">
              <Input
                type="date"
                value={targetLaunchDate}
                onChange={(e) => setTargetLaunchDate(e.target.value)}
                inputSize="md"
              />
              <p className="mt-1 text-[11px] text-[var(--text-4)]">
                설정 시 D-30/14/7/3/1/D-DAY에 담당자 전원에게 자동 이메일 알림이 발송됩니다.
              </p>
            </Field>
            <Field label="설명" className="sm:col-span-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="제품 컨셉, 목표 채널 등"
                rows={2}
              />
            </Field>
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader
            title="단계별 담당 지정"
            subtitle="담당자 이메일을 지정하면 해당 단계 시작 시 체크리스트가 포함된 알림 메일이 발송됩니다."
          />
          {loadingTemplate ? (
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
                    <Field label="담당자 이름">
                      <Input
                        value={owners[idx]?.ownerName ?? ''}
                        onChange={(e) => setOwner(idx, { ownerName: e.target.value })}
                        placeholder="홍길동"
                        inputSize="sm"
                      />
                    </Field>
                    <Field label="담당자 이메일">
                      <Input
                        type="email"
                        value={owners[idx]?.ownerEmail ?? ''}
                        onChange={(e) => setOwner(idx, { ownerEmail: e.target.value })}
                        placeholder="user@joinandjoin.com"
                        inputSize="sm"
                      />
                    </Field>
                    <Field label="단계 마감일">
                      <Input
                        type="date"
                        value={owners[idx]?.dueDate ?? ''}
                        onChange={(e) => setOwner(idx, { dueDate: e.target.value })}
                        inputSize="sm"
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
          <Button type="submit" variant="primary" size="md" disabled={submitting || loadingTemplate}>
            {submitting ? '생성 중…' : '출시 프로젝트 생성'}
          </Button>
        </div>
      </form>
    </AppLayout>
  );
}
