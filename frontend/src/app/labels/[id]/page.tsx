'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import NutritionLabel from '@/components/NutritionLabel';
import PrintableLabel from '@/components/PrintableLabel';
import ReviewWorkflow from '@/components/ReviewWorkflow';
import { api } from '@/lib/api';
import { HealthClaim, getClaimBadgeColor } from '@/lib/healthClaims';
import { analyzeOriginRequirements, OriginRequirement } from '@/lib/originRules';

interface Label {
  id: string;
  productName: string;
  productType: string | null;
  salesChannel: string | null;
  status: string;
  servingSize: number | null;
  servingUnit: string | null;
  totalContent: number | null;
  totalUnit: string | null;
  healthClaims: HealthClaim[] | null;
  aiNotes: any | null;
  labelSnapshot: any | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    department: string | null;
  };
  nutritionInfo: any;
  ingredients: Array<{
    id: string;
    name: string;
    ratio: number;
    origin: string | null;
    allergen: boolean;
    allergenInfo: string | null;
  }>;
  reviewCategories: any[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-gray-100 text-gray-700' },
  in_review: { label: '검토 중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인 완료', color: 'bg-green-100 text-green-700' },
};

export default function LabelDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [label, setLabel] = useState<Label | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'result' | 'label' | 'claims' | 'ainotes' | 'review'>('result');
  const [deleting, setDeleting] = useState(false);
  const [labelFormat, setLabelFormat] = useState<'korea' | 'us' | 'japan'>('korea');

  // 수정 모드
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editChannel, setEditChannel] = useState('');
  const [editServingSize, setEditServingSize] = useState('');
  const [editServingUnit, setEditServingUnit] = useState('g');
  const [editTotalContent, setEditTotalContent] = useState('');
  const [editTotalUnit, setEditTotalUnit] = useState('g');
  const [editNutrition, setEditNutrition] = useState<Record<string, string>>({});

  const fetchLabel = async () => {
    try {
      const data = await api.labels.get(id);
      setLabel(data.label);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLabel();
  }, [id]);

  const startEdit = () => {
    if (!label) return;
    setEditName(label.productName);
    setEditType(label.productType || '');
    setEditChannel(label.salesChannel || '');
    setEditServingSize(label.servingSize != null ? String(label.servingSize) : '');
    setEditServingUnit(label.servingUnit || 'g');
    setEditTotalContent(label.totalContent != null ? String(label.totalContent) : '');
    setEditTotalUnit(label.totalUnit || 'g');
    const ni = label.nutritionInfo || {};
    setEditNutrition({
      calories: ni.calories != null ? String(ni.calories) : '',
      carbohydrates: ni.carbohydrates != null ? String(ni.carbohydrates) : '',
      sugars: ni.sugars != null ? String(ni.sugars) : '',
      dietaryFiber: ni.dietaryFiber != null ? String(ni.dietaryFiber) : '',
      protein: ni.protein != null ? String(ni.protein) : '',
      totalFat: ni.totalFat != null ? String(ni.totalFat) : '',
      saturatedFat: ni.saturatedFat != null ? String(ni.saturatedFat) : '',
      transFat: ni.transFat != null ? String(ni.transFat) : '',
      cholesterol: ni.cholesterol != null ? String(ni.cholesterol) : '',
      sodium: ni.sodium != null ? String(ni.sodium) : '',
      vitaminA: ni.vitaminA != null ? String(ni.vitaminA) : '',
      vitaminC: ni.vitaminC != null ? String(ni.vitaminC) : '',
      calcium: ni.calcium != null ? String(ni.calcium) : '',
      iron: ni.iron != null ? String(ni.iron) : '',
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!label) return;
    setSaving(true);
    setError('');
    try {
      await api.labels.update(id, {
        productName: editName,
        productType: editType || null,
        salesChannel: editChannel || null,
        servingSize: editServingSize || null,
        servingUnit: editServingUnit,
        totalContent: editTotalContent || null,
        totalUnit: editTotalUnit,
        nutritionInfo: editNutrition,
      });
      setEditMode(false);
      setLoading(true);
      await fetchLabel();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('이 표기사항을 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      await api.labels.delete(id);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-gray-500">로딩 중...</div>
      </AppLayout>
    );
  }

  if (error && !label) {
    return (
      <AppLayout>
        <div className="card text-center py-12">
          <p className="text-red-600 mb-4">{error || '라벨을 찾을 수 없습니다.'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            대시보드로 돌아가기
          </button>
        </div>
      </AppLayout>
    );
  }

  if (!label) return null;

  const statusInfo = STATUS_MAP[label.status] || STATUS_MAP.draft;
  const healthClaims: HealthClaim[] = (label.healthClaims as HealthClaim[]) || [];
  const eligibleClaims = healthClaims.filter(c => c.eligible);
  const aiNotes = label.aiNotes as any;
  const snapshot = label.labelSnapshot as any;

  // 라벨 프리뷰용 데이터 변환
  const nutritionForPreview = label.nutritionInfo || {};
  const ingredientsForPreview = label.ingredients.map(i => ({
    name: i.name,
    ratio: String(i.ratio),
    origin: i.origin || '',
    allergen: i.allergen,
    allergenInfo: i.allergenInfo || '',
  }));

  const TABS = [
    { id: 'result' as const, name: '표기사항 결과' },
    { id: 'label' as const, name: '라벨 디자인' },
    { id: 'claims' as const, name: '강조 표기사항' },
    { id: 'ainotes' as const, name: 'AI 검수 노트' },
    { id: 'review' as const, name: '부서별 검토' },
  ];

  return (
    <AppLayout>
      {/* 헤더 */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{label.productName}</h1>
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {eligibleClaims.length > 0 && (
              <div className="flex gap-1">
                {eligibleClaims.slice(0, 4).map(c => (
                  <span key={c.id} className={`px-2 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                    {c.name}
                  </span>
                ))}
                {eligibleClaims.length > 4 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                    +{eligibleClaims.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            {label.productType && <span>{label.productType}</span>}
            {label.salesChannel && <span>채널: {label.salesChannel}</span>}
            <span>작성: {label.createdBy.name || label.createdBy.email}</span>
            <span>{new Date(label.createdAt).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode && (
            <button onClick={startEdit} className="btn-secondary text-sm">
              수정
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-danger text-sm"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 탭 */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-4 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* 수정 모드 */}
      {editMode && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">제품 정보 수정</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditMode(false)} className="btn-secondary text-sm">취소</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">제품명</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">식품유형</label>
              <input type="text" value={editType} onChange={e => setEditType(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">판매채널</label>
              <input type="text" value={editChannel} onChange={e => setEditChannel(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">1회 제공량</label>
              <div className="flex gap-1">
                <input type="number" value={editServingSize} onChange={e => setEditServingSize(e.target.value)}
                  className="input-field text-sm flex-1" step="any" />
                <select value={editServingUnit} onChange={e => setEditServingUnit(e.target.value)} className="input-field text-sm w-16">
                  <option value="g">g</option><option value="ml">ml</option>
                  <option value="개">개</option><option value="포">포</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">총 내용량</label>
              <div className="flex gap-1">
                <input type="number" value={editTotalContent} onChange={e => setEditTotalContent(e.target.value)}
                  className="input-field text-sm flex-1" step="any" />
                <select value={editTotalUnit} onChange={e => setEditTotalUnit(e.target.value)} className="input-field text-sm w-16">
                  <option value="g">g</option><option value="ml">ml</option>
                  <option value="kg">kg</option><option value="L">L</option>
                </select>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold mb-3">영양성분</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { key: 'calories', label: '열량(kcal)' },
              { key: 'carbohydrates', label: '탄수화물(g)' },
              { key: 'sugars', label: '당류(g)' },
              { key: 'dietaryFiber', label: '식이섬유(g)' },
              { key: 'protein', label: '단백질(g)' },
              { key: 'totalFat', label: '지방(g)' },
              { key: 'saturatedFat', label: '포화지방(g)' },
              { key: 'transFat', label: '트랜스지방(g)' },
              { key: 'cholesterol', label: '콜레스테롤(mg)' },
              { key: 'sodium', label: '나트륨(mg)' },
              { key: 'vitaminA', label: '비타민A' },
              { key: 'vitaminC', label: '비타민C' },
              { key: 'calcium', label: '칼슘' },
              { key: 'iron', label: '철' },
            ].map(({ key, label: lbl }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-0.5">{lbl}</label>
                <input type="number" value={editNutrition[key] || ''}
                  onChange={e => setEditNutrition(prev => ({ ...prev, [key]: e.target.value }))}
                  className="input-field text-sm" step="any" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 표기사항 결과 */}
      {activeTab === 'result' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card flex flex-col items-center">
            <h3 className="text-lg font-bold mb-4 self-start">영양성분표</h3>
            <NutritionLabel
              productName={label.productName}
              servingSize={label.servingSize}
              servingUnit={label.servingUnit}
              totalContent={label.totalContent}
              totalUnit={label.totalUnit}
              nutritionInfo={label.nutritionInfo}
            />
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4">원재료명 및 함량</h3>
            {label.ingredients.length > 0 ? (
              <>
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">원재료 표기문 (실제 라벨 표기)</h4>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm leading-relaxed">
                    {(() => {
                      const sorted = [...label.ingredients].sort((a, b) => b.ratio - a.ratio);
                      const originAnalysis = analyzeOriginRequirements(
                        sorted.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin || '' })),
                        label.productType || '',
                        label.productName,
                      );
                      return sorted.map(ing => {
                        let text = ing.name;
                        const req = originAnalysis.find(r => r.ingredientName === ing.name.trim());
                        if (req?.required && ing.origin) text += `(${ing.origin})`;
                        return text;
                      }).join(', ');
                    })()}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">※ 배합비(%)는 내부 관리용이며 실제 표기사항에는 기재하지 않습니다.</p>
                  <p className="text-xs text-gray-400">※ 원산지는 법적 의무 대상 원재료만 표기합니다.</p>
                </div>

                {label.ingredients.some(ing => ing.allergen) && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="text-sm font-bold text-yellow-800 mb-1">알레르기 유발물질</h4>
                    <p className="text-sm text-yellow-700">
                      {label.ingredients
                        .filter(ing => ing.allergen && ing.allergenInfo)
                        .map(ing => ing.allergenInfo)
                        .join(', ')}
                    </p>
                  </div>
                )}

                <h4 className="text-sm font-medium text-gray-600 mb-2">배합비 상세</h4>
                {(() => {
                  const sorted = [...label.ingredients].sort((a, b) => b.ratio - a.ratio);
                  const originAnalysis = analyzeOriginRequirements(
                    sorted.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin || '' })),
                    label.productType || '',
                    label.productName,
                  );
                  return (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">원재료</th>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">배합비</th>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">원산지</th>
                          <th className="px-2 py-1 text-left text-xs text-gray-500">표기 의무</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sorted.map(ing => {
                          const req = originAnalysis.find(r => r.ingredientName === ing.name.trim());
                          return (
                            <tr key={ing.id}>
                              <td className="px-2 py-1.5">
                                {ing.name}
                                {ing.allergen && <span className="ml-1 text-xs text-yellow-600">(알레르기)</span>}
                              </td>
                              <td className="px-2 py-1.5">{ing.ratio}%</td>
                              <td className="px-2 py-1.5 text-gray-500">{ing.origin || '-'}</td>
                              <td className="px-2 py-1.5">
                                {req?.required ? (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">필수</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">해당없음</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </>
            ) : (
              <p className="text-gray-500 text-sm">등록된 원재료가 없습니다.</p>
            )}
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-4">제품 정보 요약</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">제품명</dt>
                <dd className="text-sm font-medium">{label.productName}</dd>
              </div>
              {label.productType && (
                <div>
                  <dt className="text-xs text-gray-500">식품유형</dt>
                  <dd className="text-sm font-medium">{label.productType}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500">판매채널</dt>
                <dd className="text-sm font-medium">{label.salesChannel || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">총 내용량</dt>
                <dd className="text-sm font-medium">
                  {label.totalContent && label.totalUnit ? `${label.totalContent}${label.totalUnit}` : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">1회 제공량</dt>
                <dd className="text-sm font-medium">
                  {label.servingSize && label.servingUnit ? `${label.servingSize}${label.servingUnit}` : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">상태</dt>
                <dd>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">작성일</dt>
                <dd className="text-sm font-medium">{new Date(label.createdAt).toLocaleString('ko-KR')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">수정일</dt>
                <dd className="text-sm font-medium">{new Date(label.updatedAt).toLocaleString('ko-KR')}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* 라벨 디자인 */}
      {activeTab === 'label' && (
        <div className="space-y-6">
          <div className="flex gap-3">
            {[
              { id: 'korea' as const, flag: '🇰🇷', name: '한국 표기' },
              { id: 'us' as const, flag: '🇺🇸', name: 'US Label' },
              { id: 'japan' as const, flag: '🇯🇵', name: '日本表示' },
            ].map(f => (
              <button key={f.id} onClick={() => setLabelFormat(f.id)}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  labelFormat === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                }`}>
                {f.flag} {f.name}
              </button>
            ))}
            <button onClick={() => window.print()} className="btn-secondary text-sm ml-auto">
              🖨️ 인쇄
            </button>
          </div>

          <div className="flex justify-center">
            <PrintableLabel
              format={labelFormat}
              productName={label.productName}
              productType={label.productType || ''}
              servingSize={label.servingSize}
              servingUnit={label.servingUnit || 'g'}
              totalContent={label.totalContent}
              totalUnit={label.totalUnit || 'g'}
              nutritionInfo={nutritionForPreview}
              ingredients={ingredientsForPreview}
              aiResult={snapshot}
            />
          </div>
        </div>
      )}

      {/* 강조 표기사항 */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          {healthClaims.length > 0 ? (
            <>
              {eligibleClaims.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold text-green-700 mb-4">표기 가능 ({eligibleClaims.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {eligibleClaims.map(c => (
                      <div key={c.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                            {c.name}
                          </span>
                        </div>
                        <p className="text-xs text-green-800">{c.reason}</p>
                        <p className="text-xs text-green-600 mt-1">{c.standard}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {healthClaims.filter(c => !c.eligible).length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-bold text-gray-500 mb-4">
                    해당 없음 ({healthClaims.filter(c => !c.eligible).length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {healthClaims.filter(c => !c.eligible).map(c => (
                      <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                        <span className="text-xs font-bold text-gray-500">{c.name}</span>
                        <p className="text-xs text-gray-400 mt-1">{c.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500">저장된 강조 표기사항 분석 데이터가 없습니다.</p>
              <p className="text-sm text-gray-400 mt-1">새 라벨 작성 시 AI 분석을 통해 자동으로 생성됩니다.</p>
            </div>
          )}
        </div>
      )}

      {/* AI 검수 노트 */}
      {activeTab === 'ainotes' && (
        <div className="space-y-6">
          {aiNotes ? (
            <>
              {/* 원산지 표기 분석 */}
              {aiNotes.originAnalysis && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-2">원산지 표기 분석</h3>
                  <p className="text-xs text-gray-500 mb-4">「농수산물의 원산지 표시 등에 관한 법률」 시행령 기준</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => r.required).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-blue-700 mb-2">
                          표기 필수 ({(aiNotes.originAnalysis as OriginRequirement[]).filter(r => r.required).length})
                        </h4>
                        <div className="space-y-1.5">
                          {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => r.required).map((r, i) => (
                            <div key={i} className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                              <span className="text-xs font-bold text-blue-700">{r.ingredientName}</span>
                              <p className="text-xs text-blue-600 mt-0.5">{r.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => !r.required).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-500 mb-2">
                          표기 불필요 ({(aiNotes.originAnalysis as OriginRequirement[]).filter(r => !r.required).length})
                        </h4>
                        <div className="space-y-1">
                          {(aiNotes.originAnalysis as OriginRequirement[]).filter(r => !r.required).map((r, i) => (
                            <div key={i} className="p-2 bg-gray-50 rounded-lg">
                              <span className="text-xs font-bold text-gray-500">{r.ingredientName}</span>
                              <p className="text-xs text-gray-400 mt-0.5">{r.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 주의사항 */}
              {aiNotes.precautions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-4">주의사항</h3>
                  {Object.entries(aiNotes.precautions).map(([market, items]: [string, any]) => {
                    if (!items?.length) return null;
                    const flag = market === 'korea' ? '🇰🇷 한국' : market === 'us' ? '🇺🇸 미국' : '🇯🇵 일본';
                    return (
                      <div key={market} className="mb-4">
                        <h4 className="text-sm font-bold text-gray-700 mb-2">{flag}</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {items.map((p: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-yellow-500">&#9888;</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 보관방법 */}
              {aiNotes.storageInstructions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-4">보관방법</h3>
                  {Object.entries(aiNotes.storageInstructions).map(([market, text]: [string, any]) => {
                    if (!text) return null;
                    const flag = market === 'korea' ? '🇰🇷' : market === 'us' ? '🇺🇸' : '🇯🇵';
                    return (
                      <div key={market} className="mb-2">
                        <span className="text-xs font-medium text-gray-500">{flag}</span>
                        <p className="text-sm text-gray-700">{text}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 규정 검토 결과 */}
              {aiNotes.compliance && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-4">규정 검토 결과</h3>
                  {Object.entries(aiNotes.compliance).map(([market, result]: [string, any]) => {
                    if (!result) return null;
                    const flag = market === 'korea' ? '🇰🇷 한국 (MFDS)' : market === 'us' ? '🇺🇸 미국 (FDA)' : '🇯🇵 일본 (CAA)';
                    return (
                      <div key={market} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-sm font-bold">{flag}</h4>
                          <span className={`text-xs font-bold ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                            {result.passed ? '통과' : '미통과'} ({result.score}/100)
                          </span>
                        </div>
                        {result.issues?.length > 0 && (
                          <ul className="text-xs text-gray-600 space-y-1 mb-2">
                            {result.issues.map((issue: any, i: number) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className={issue.severity === 'error' ? 'text-red-500' : 'text-yellow-500'}>
                                  {issue.severity === 'error' ? '●' : '▲'}
                                </span>
                                <span>{issue.message}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {result.recommendations?.length > 0 && (
                          <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                            <strong>권장사항:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {result.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12">
              <p className="text-gray-500">저장된 AI 검수 노트가 없습니다.</p>
              <p className="text-sm text-gray-400 mt-1">새 라벨 작성 시 AI 검수를 통해 자동으로 생성됩니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 부서별 검토 */}
      {activeTab === 'review' && (
        <ReviewWorkflow
          labelId={label.id}
          reviewCategories={label.reviewCategories}
          onUpdate={fetchLabel}
        />
      )}
    </AppLayout>
  );
}
