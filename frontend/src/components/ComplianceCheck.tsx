'use client';

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

export default function ComplianceCheck({ result, targetMarkets }: Props) {
  return (
    <div className="space-y-6">
      {/* 요약 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {targetMarkets.map(market => {
          const info = MARKET_INFO[market];
          const r = result[market];
          if (!info || !r) return null;
          return (
            <div key={market} className={`card border-2 ${r.passed ? 'border-green-200' : 'border-red-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{info.flag}</span>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                  r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {r.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <h3 className="font-bold">{info.name}</h3>
              <p className="text-xs text-gray-500">{info.body}</p>
              <div className="mt-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>적합도</span>
                  <span className="font-bold">{r.score}/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${r.score >= 80 ? 'bg-green-500' : r.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${r.score}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {r.issues.filter(i => i.severity === 'error').length}개 오류, {r.issues.filter(i => i.severity === 'warning').length}개 경고
              </div>
            </div>
          );
        })}
      </div>

      {/* 상세 이슈 */}
      {targetMarkets.map(market => {
        const info = MARKET_INFO[market];
        const r = result[market];
        if (!info || !r || r.issues.length === 0) return null;
        return (
          <div key={market} className="card">
            <h3 className="font-bold text-lg mb-4">{info.flag} {info.name} - 상세 검토 결과</h3>
            <div className="space-y-3">
              {r.issues.map((issue, i) => (
                <div key={i} className={`p-3 rounded-lg border ${
                  issue.severity === 'error'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">
                      {issue.severity === 'error' ? '❌' : '⚠️'}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          issue.severity === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {issue.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800">{issue.message}</p>
                      <p className="text-xs text-gray-500 mt-1">근거: {issue.regulation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {r.recommendations.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-bold text-sm text-blue-800 mb-2">개선 권장사항</h4>
                <ul className="space-y-1">
                  {r.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                      <span className="mt-1">💡</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
