'use client';

// 미팅 목적 입력 — 드롭다운 선택형.
// 목적별 영업 통계를 내려면 자유 입력이면 안 되므로 고정 선택지를 쓰되,
// '기타'를 고르면 직접 입력받아 그 텍스트를 그대로 저장한다(저장 필드는 meetingPurpose 하나).
//
// 과거 자유 입력으로 저장된 값은 고정 선택지에 없으므로 '기타'로 열어 값을 보존한다.

import { useEffect, useState } from 'react';
import { Field, Input, Select } from '@/components/ui';
import { MEETING_PURPOSES, MEETING_PURPOSE_ETC, MEETING_PURPOSE_FIXED } from '@/lib/sales';

export default function MeetingPurposeField({
  value,
  onChange,
  hint,
}: {
  /** 최종 저장값 (journal.meetingPurpose) */
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  // 고정 선택지에 없는 기존 값(과거 자유 입력)은 '기타'가 선택된 상태로 시작
  const [isEtc, setIsEtc] = useState(() => !!value && !MEETING_PURPOSE_FIXED.includes(value));

  // 값이 밖에서 채워지는 경우(AI 자동 채움 등)에도 자유 텍스트면 '기타'로 열어준다.
  // 이게 없으면 AI가 넣은 문장이 화면에서 사라진 것처럼 보인다.
  useEffect(() => {
    if (value && !MEETING_PURPOSE_FIXED.includes(value)) setIsEtc(true);
  }, [value]);

  const selected = isEtc ? MEETING_PURPOSE_ETC : MEETING_PURPOSE_FIXED.includes(value) ? value : '';

  const handleSelect = (next: string) => {
    if (next === MEETING_PURPOSE_ETC) {
      setIsEtc(true);
      onChange(''); // 직접 입력 대기 — 비어 있으면 기존 필수 검증에 그대로 걸린다
    } else {
      setIsEtc(false);
      onChange(next);
    }
  };

  return (
    <Field label="미팅 목적" required hint={hint}>
      <Select value={selected} onChange={(e) => handleSelect(e.target.value)}>
        <option value="">선택하세요</option>
        {MEETING_PURPOSES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      {isEtc && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="미팅 목적을 직접 입력해주세요"
          className="mt-2"
        />
      )}
    </Field>
  );
}
