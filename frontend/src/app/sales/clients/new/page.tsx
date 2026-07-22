'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import SalesTabs from '@/components/SalesTabs';
import { api } from '@/lib/api';
import { SALES_STAGES, STORAGE_CONDITIONS, WIN_PROBABILITY_OPTIONS } from '@/lib/sales';
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
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  // 실무 담당자 — 저장 시 거래처의 첫 명함(SalesContact)으로 만들어진다
  const [contactName, setContactName] = useState('');
  const [contactPosition, setContactPosition] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactStorageCondition, setContactStorageCondition] = useState('');
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
    if (!expectedCloseDate) {
      setError('예상 계약일을 입력해주세요. 매출 타임라인 예측에 필요합니다.');
      return;
    }
    // 담당자를 모른 채 거래처만 늘어나는 걸 막는다 — 첫 명함은 등록 시점에 받는다
    if (!contactName.trim()) {
      setError('담당자명을 입력해주세요. 거래처는 담당자 명함 1건 이상이 있어야 등록됩니다.');
      return;
    }
    if (!contactStorageCondition) {
      setError('담당자의 보관 조건을 선택해주세요. (냉동/냉장/상온/전체)');
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
        expectedCloseDate,
        contactName: contactName.trim(),
        contactPosition: contactPosition.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactStorageCondition,
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
                {WIN_PROBABILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="예상 계약일"
              required
              className="sm:col-span-2"
              hint="월별 매출 타임라인의 기준입니다. 정확하지 않아도 되니 현재 판단으로 입력하고, 진행되면서 조정하세요."
            >
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
              />
            </Field>

            <div className="sm:col-span-2 pt-1 border-t border-[var(--border-1)]" />
            <div className="sm:col-span-2">
              <div className="text-[13px] font-medium text-[var(--text-1)]">첫 담당자 명함</div>
              <p className="text-[11.5px] text-[var(--text-3)] mt-0.5">
                거래처는 담당자 명함 1건 이상이 있어야 등록됩니다. 명함 이미지는 등록 후 거래처 상세에서 첨부할 수 있습니다.
              </p>
            </div>
            <Field label="담당자명" required>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="예: 김철수"
              />
            </Field>
            <Field
              label="보관 조건"
              required
              hint="이 담당자가 맡는 구분입니다. 같은 거래처라도 냉동·냉장·상온 바이어가 다릅니다."
            >
              <Select
                value={contactStorageCondition}
                onChange={(e) => setContactStorageCondition(e.target.value)}
              >
                <option value="">보관 조건 선택</option>
                {STORAGE_CONDITIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="직급·직함">
              <Input
                value={contactPosition}
                onChange={(e) => setContactPosition(e.target.value)}
                placeholder="예: 구매팀 MD"
              />
            </Field>
            <Field label="담당자 연락처">
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </Field>
            <Field label="담당자 이메일" className="sm:col-span-2">
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="buyer@example.com"
              />
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

        <div className="flex flex-wrap items-center gap-2">
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
