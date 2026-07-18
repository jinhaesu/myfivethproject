'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SALES_STAGES } from '@/lib/sales';
import {
  PageHeader,
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  Textarea,
  Field,
} from '@/components/ui';

export default function NewSalesClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [bizNumber, setBizNumber] = useState('');
  const [stage, setStage] = useState('lead');
  const [expectedRevenue, setExpectedRevenue] = useState('');
  const [winProbability, setWinProbability] = useState('');
  const [ownerOrg, setOwnerOrg] = useState('');
  const [buyerComposition, setBuyerComposition] = useState('');
  const [annualRevenue, setAnnualRevenue] = useState('');
  const [existingVendors, setExistingVendors] = useState('');
  const [managedItems, setManagedItems] = useState('');
  const [storageCondition, setStorageCondition] = useState('');
  const [logisticsCondition, setLogisticsCondition] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setError('거래처명을 입력해주세요.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const data = await api.sales.createClient({
        name: name.trim(),
        bizNumber: bizNumber.trim() || undefined,
        stage,
        expectedRevenue: expectedRevenue.trim() ? Number(expectedRevenue.replace(/[,\s]/g, '')) : undefined,
        winProbability: winProbability.trim() ? Number(winProbability) : undefined,
        ownerOrg: ownerOrg.trim() || undefined,
        buyerComposition: buyerComposition.trim() || undefined,
        annualRevenue: annualRevenue.trim() || undefined,
        existingVendors: existingVendors.trim() || undefined,
        managedItems: managedItems.trim() || undefined,
        storageCondition: storageCondition.trim() || undefined,
        logisticsCondition: logisticsCondition.trim() || undefined,
        note: note.trim() || undefined,
      });
      router.push(`/sales/clients/${data.client.id}`);
    } catch (e: any) {
      setError(e?.message || '거래처 등록에 실패했습니다.');
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <SalesTabs />
      <PageHeader eyebrow="Sales Pipeline" title="거래처 등록" />

      <div className="max-w-2xl flex flex-col gap-4">
        <Card>
          <CardHeader title="기본 정보" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="거래처명" required className="sm:col-span-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: ○○마트, ○○플랫폼"
              />
            </Field>
            <Field label="사업자번호">
              <Input
                value={bizNumber}
                onChange={(e) => setBizNumber(e.target.value)}
                placeholder="000-00-00000"
              />
            </Field>
            <Field label="영업 단계">
              <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                {SALES_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="예상 매출(월)" hint="원 단위, 예: 30000000">
              <Input
                type="number"
                value={expectedRevenue}
                onChange={(e) => setExpectedRevenue(e.target.value)}
                placeholder="예: 30000000"
              />
            </Field>
            <Field label="성사 확률(%)" hint="미입력 시 단계 기본값 적용">
              <Select value={winProbability} onChange={(e) => setWinProbability(e.target.value)}>
                <option value="">단계 기본값</option>
                {[10, 25, 50, 75, 90].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="최초 미팅 시 거래처 정보"
            subtitle="첫 미팅에서 파악한 거래처 프로필을 입력합니다 (선택)."
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="담당 조직">
              <Input value={ownerOrg} onChange={(e) => setOwnerOrg(e.target.value)} placeholder="예: 상품본부 신선식품팀" />
            </Field>
            <Field label="바이어·거래처 연매출">
              <Input value={annualRevenue} onChange={(e) => setAnnualRevenue(e.target.value)} placeholder="예: 연 500억 규모" />
            </Field>
            <Field label="바이어 구성" className="sm:col-span-2">
              <Textarea value={buyerComposition} onChange={(e) => setBuyerComposition(e.target.value)} placeholder="바이어 조직·구성원·의사결정 라인" />
            </Field>
            <Field label="기존 거래처" className="sm:col-span-2">
              <Textarea value={existingVendors} onChange={(e) => setExistingVendors(e.target.value)} placeholder="현재 거래 중인 주요 벤더" />
            </Field>
            <Field label="관리 품목" className="sm:col-span-2">
              <Textarea value={managedItems} onChange={(e) => setManagedItems(e.target.value)} placeholder="취급/관리 품목군" />
            </Field>
            <Field label="보관 조건">
              <Input value={storageCondition} onChange={(e) => setStorageCondition(e.target.value)} placeholder="예: 냉장/냉동/실온" />
            </Field>
            <Field label="물류 조건">
              <Input value={logisticsCondition} onChange={(e) => setLogisticsCondition(e.target.value)} placeholder="예: 센터 입고, 직납, 리드타임" />
            </Field>
            <Field label="비고" className="sm:col-span-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="기타 참고 사항" />
            </Field>
          </div>
        </Card>

        {error ? <div className="text-[12.5px] text-[var(--danger-fg)]">{error}</div> : null}

        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" onClick={submit} loading={saving}>
            거래처 등록
          </Button>
          <Link href="/sales/clients">
            <Button variant="ghost" size="md">
              취소
            </Button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
