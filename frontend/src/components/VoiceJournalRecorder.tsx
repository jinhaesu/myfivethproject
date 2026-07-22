'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Textarea } from '@/components/ui';

// 브라우저 음성인식 API는 표준 lib.dom에 없어 최소한만 직접 선언한다
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const ERROR_LABEL: Record<string, string> = {
  'not-allowed': '마이크 권한이 거부되었습니다. 브라우저 주소창의 자물쇠 아이콘에서 마이크를 허용해주세요.',
  'service-not-allowed': '브라우저가 음성인식 서비스를 차단했습니다. HTTPS 환경인지 확인해주세요.',
  'audio-capture': '마이크를 찾을 수 없습니다. 입력 장치를 확인해주세요.',
  network: '네트워크 오류로 음성인식이 중단됐습니다.',
};

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VoiceJournalRecorder({
  transcript,
  onTranscriptChange,
  onApply,
  applying,
  disabled,
  disabledReason,
}: {
  transcript: string;
  onTranscriptChange: (v: string) => void;
  onApply: () => void;
  applying: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // 사용자가 멈춘 것인지, 침묵으로 브라우저가 끊은 것인지 구분해야 재시작 여부를 정한다
  const wantListeningRef = useRef(false);
  // onresult 콜백은 생성 시점의 state를 캡처하므로, 누적 텍스트는 ref로 들고 간다
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
  }, []);

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [listening]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError('');
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const text = r[0]?.transcript || '';
        if (r.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk) {
        const prev = transcriptRef.current;
        const next = prev ? `${prev.replace(/\s+$/, '')} ${finalChunk.trim()}` : finalChunk.trim();
        transcriptRef.current = next;
        onTranscriptChange(next);
      }
      setInterim(interimChunk);
    };

    rec.onerror = (e) => {
      // no-speech는 잠깐 말을 멈춘 것뿐이라 오류로 띄우지 않는다
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setError(ERROR_LABEL[e.error] || `음성인식 오류: ${e.error}`);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    // 브라우저는 몇 초 침묵하면 인식을 스스로 끝낸다 — 사용자가 멈추기 전까지는 다시 켠다
    rec.onend = () => {
      if (!wantListeningRef.current) {
        setListening(false);
        return;
      }
      try {
        rec.start();
      } catch {
        setListening(false);
        wantListeningRef.current = false;
      }
    };

    recRef.current = rec;
    wantListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
      setElapsed(0);
    } catch {
      setError('음성인식을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
      wantListeningRef.current = false;
    }
  }, [onTranscriptChange]);

  // 화면을 벗어날 때 마이크를 붙잡고 있지 않도록 정리
  useEffect(
    () => () => {
      wantListeningRef.current = false;
      recRef.current?.abort();
    },
    [],
  );

  if (!supported) {
    return (
      <div className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-2)] p-3">
        <div className="text-[12.5px] font-medium text-[var(--text-2)]">음성으로 작성</div>
        <p className="text-[11.5px] text-[var(--text-3)] mt-1">
          이 브라우저는 음성인식을 지원하지 않습니다. Chrome 또는 Edge에서 열면 사용할 수 있습니다.
          그동안은 아래 메모란에 직접 입력한 뒤 AI로 채우기를 눌러주세요.
        </p>
      </div>
    );
  }

  const hasText = transcript.trim().length > 0;

  return (
    <div className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-[12.5px] font-medium text-[var(--text-2)]">음성으로 작성</div>
          <p className="text-[11.5px] text-[var(--text-3)] mt-0.5">
            미팅 직후 말로 남기면 AI가 일지 형식으로 정리합니다. 원문은 그대로 보관됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {listening && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--danger-fg)] tabular">
              <span className="w-2 h-2 rounded-full bg-[var(--danger-fg)] animate-pulse" />
              {fmtElapsed(elapsed)}
            </span>
          )}
          <Button
            variant={listening ? 'secondary' : 'primary'}
            size="sm"
            onClick={listening ? stop : start}
          >
            {listening ? '■ 녹음 종료' : '● 녹음 시작'}
          </Button>
        </div>
      </div>

      {!hasText && !listening && (
        <div className="text-[11.5px] text-[var(--text-4)] leading-relaxed mb-2">
          이런 순서로 말하면 빠짐없이 정리됩니다 — <br />
          누구를 어디서 만났는지 · 무슨 얘기를 했는지 · 거래처 요청사항 · 제품 관련 요구 · 다음에 할 일과 시점
        </div>
      )}

      <Textarea
        value={listening && interim ? `${transcript} ${interim}` : transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
        rows={hasText || listening ? 6 : 3}
        placeholder={listening ? '듣고 있습니다… 편하게 말씀하세요.' : '녹음 시작을 누르거나, 여기에 직접 메모해도 됩니다.'}
        className="text-[12.5px]"
      />

      {error && <div className="mt-1.5 text-[11.5px] text-[var(--danger-fg)]">{error}</div>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onApply}
          loading={applying}
          disabled={!hasText || listening || disabled}
          title={disabled ? disabledReason : ''}
        >
          {applying ? 'AI 정리 중…' : '✦ 이 내용으로 일지 채우기'}
        </Button>
        {hasText && !listening && (
          <button
            type="button"
            onClick={() => onTranscriptChange('')}
            className="text-[11.5px] text-[var(--text-4)] hover:text-[var(--danger-fg)] transition-colors"
          >
            원문 지우기
          </button>
        )}
        {disabled && disabledReason && (
          <span className="text-[11.5px] text-[var(--text-4)]">{disabledReason}</span>
        )}
      </div>
    </div>
  );
}
