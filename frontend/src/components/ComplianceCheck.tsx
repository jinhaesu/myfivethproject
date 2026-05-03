'use client';

import { Card, Badge } from '@/components/ui';

interface Issue {
  severity: 'error' | 'warning';
  category: string;
  message: string;
  regulation: string;
}

interface MarketResult {
  passed: boolean;
  score: number;
  issues: Issue[];
  recommendations: string[];
}

interface Props {
  result: Record<string, MarketResult>;
  targetMarkets: string[];
}

const MARKET_INFO: Record<string, { flag: string; name: string; body: string }> = {
  korea: { flag: '🇰🇷', name: '한국', body: 'MFDS (식약처)' },
  us: { flag: '🇺🇸', name: '미국', body: 'FDA' },
  japan: { flag: '🇯🇵', name: '일본', body: 'CAA (소비자청)' },
};

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'var(--success-fg)';
  if (score >= 50) return 'var(--warning-fg)';
  return 'var(--danger-fg)';
}

export default function ComplianceCheck({ result, targetMarkets }: Props) {
  return (
    <div className="space-y-6">
      {/* 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {targetMarkets.map((market) => {
          const info = MARKET_INFO[market];
          const r = result[market];
          if (!info || !r) return null;
          const errorCount = r.issues.filter((i) => i.severity === 'error').length;
          const warnCount = r.issues.filter((i) => i.severity === 'warning').length;
          return (
            <Card key={market} padding="md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{info.flag}</span>
                <Badge tone={r.passed ? 'success' : 'danger'} size="sm" dot>
                  {r.passed ? 'PASS' : 'FAIL'}
                </Badge>
              </div>
              <div className="text-[14px] font-semibold text-[var(--text-1)]">{info.name}</div>
              <div className="text-[11px] text-[var(--text-4)] uppercase tracking-[0.06em] mt-0.5">
                {info.body}
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-[12px] mb-1.5 text-[var(--text-3)]">
                  <span>적합도</span>
                  <span className="tabular text-[var(--text-1)] font-semibold">
                    <Badge tone={scoreTone(r.score)} size="xs">
                      {r.score}/100
                    </Badge>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-base ease-out-soft"
                    style={{ width: `${r.score}%`, background: scoreBarColor(r.score) }}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                {errorCount > 0 ? (
                  <Badge tone="danger" size="xs">
                    오류 {errorCount}
                  </Badge>
                ) : null}
                {warnCount > 0 ? (
                  <Badge tone="warning" size="xs">
                    경고 {warnCount}
                  </Badge>
                ) : null}
                {errorCount === 0 && warnCount === 0 ? (
                  <span className="text-[var(--success-fg)]">이슈 없음</span>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 상세 이슈 */}
      {targetMarkets.map((market) => {
        const info = MARKET_INFO[market];
        const r = result[market];
        if (!info || !r || r.issues.length === 0) return null;
        return (
          <Card key={market} padding="md">
            <h3 className="text-[14px] font-semibold tracking-tight text-[var(--text-1)] mb-4">
              {info.flag} {info.name} · 상세 검토 결과
            </h3>
            <div className="space-y-2.5">
              {r.issues.map((issue, i) => {
                const tone = issue.severity === 'error' ? 'danger' : 'warning';
                return (
                  <div
                    key={i}
                    className={
                      tone === 'danger'
                        ? 'p-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)]'
                        : 'p-3 rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)]'
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <Badge tone={tone} size="xs">
                        {issue.severity === 'error' ? 'ERROR' : 'WARN'}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-3)] font-medium">
                            {issue.category}
                          </span>
                        </div>
                        <p className="text-[13px] text-[var(--text-1)] leading-[1.55]">{issue.message}</p>
                        <p className="text-[11.5px] text-[var(--text-3)] mt-1.5">근거 · {issue.regulation}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {r.recommendations.length > 0 && (
              <div className="mt-4 p-3 rounded-md border border-[var(--info-border)] bg-[var(--info-bg)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--info-fg)] mb-2">
                  개선 권장사항
                </div>
                <ul className="space-y-1">
                  {r.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="text-[13px] text-[var(--text-2)] flex items-start gap-2 leading-[1.55]"
                    >
                      <span className="text-[var(--info-fg)] mt-0.5">›</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
