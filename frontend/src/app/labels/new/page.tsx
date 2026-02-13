'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import NutritionLabel from '@/components/NutritionLabel';
import ComplianceCheck from '@/components/ComplianceCheck';
import PrintableLabel from '@/components/PrintableLabel';
import { api } from '@/lib/api';
import { SAMPLE_TEMPLATES, SampleTemplate } from '@/data/sampleLabels';
import { analyzeHealthClaims, HealthClaim, getEligibleClaims, getClaimBadgeColor } from '@/lib/healthClaims';

interface Ingredient {
  name: string;
  ratio: string;
  origin: string;
  allergen: boolean;
  allergenInfo: string;
}

const EMPTY_INGREDIENT: Ingredient = {
  name: '', ratio: '', origin: '', allergen: false, allergenInfo: '',
};

const STEPS = ['템플릿 선택', '기본 정보', 'AI 생성', '규정 검토', '최종 결과'];

function HealthClaimsPanel({ claims }: { claims: HealthClaim[] }) {
  const eligible = getEligibleClaims(claims);
  const ineligible = claims.filter(c => !c.eligible);

  return (
    <div className="card">
      <h3 className="text-lg font-bold mb-4">강조 표기사항 분석</h3>
      <p className="text-xs text-gray-500 mb-4">
        식약처 「식품등의 표시·광고에 관한 법률」 기준
      </p>

      {eligible.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-bold text-green-700 mb-2">표기 가능 ({eligible.length})</h4>
          <div className="space-y-2">
            {eligible.map(c => (
              <div key={c.id} className="flex items-start gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                  {c.name}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-800">{c.reason}</p>
                  <p className="text-xs text-green-600 mt-0.5">{c.standard}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ineligible.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-500 mb-2">해당 없음 ({ineligible.length})</h4>
          <div className="space-y-1">
            {ineligible.map(c => (
              <div key={c.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                  {c.name}
                </span>
                <p className="text-xs text-gray-500 flex-1">{c.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewLabelPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 기본 정보
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState('');
  const [salesChannel, setSalesChannel] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState('g');
  const [totalContent, setTotalContent] = useState('');
  const [totalUnit, setTotalUnit] = useState('g');
  const [targetMarkets, setTargetMarkets] = useState<string[]>(['korea']);

  // 영양성분
  const [nutrition, setNutrition] = useState<Record<string, string>>({
    calories: '', carbohydrates: '', sugars: '', dietaryFiber: '',
    protein: '', totalFat: '', saturatedFat: '', transFat: '',
    cholesterol: '', sodium: '', vitaminA: '', vitaminC: '', calcium: '', iron: '',
  });

  // 원재료
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ ...EMPTY_INGREDIENT }]);

  // AI 생성 결과
  const [aiResult, setAiResult] = useState<any>(null);
  const [complianceResult, setComplianceResult] = useState<any>(null);

  // 인쇄용 라벨 포맷
  const [labelFormat, setLabelFormat] = useState<'korea' | 'us' | 'japan'>('korea');

  const applyTemplate = (template: SampleTemplate) => {
    setProductName(template.name);
    setProductType(template.productType);
    setServingSize(template.servingSize);
    setServingUnit(template.servingUnit);
    setTotalContent(template.totalContent);
    setTotalUnit(template.totalUnit);
    setIngredients(template.ingredients.map(i => ({ ...i })));
    setNutrition({ ...template.nutrition });
    setStep(1);
  };

  const handleNutritionChange = (key: string, value: string) => {
    setNutrition(prev => ({ ...prev, [key]: value }));
  };

  const addIngredient = () => setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]);
  const removeIngredient = (idx: number) => setIngredients(ingredients.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, field: keyof Ingredient, value: any) => {
    const updated = [...ingredients];
    updated[idx] = { ...updated[idx], [field]: value };
    setIngredients(updated);
  };

  const toggleMarket = (market: string) => {
    setTargetMarkets(prev =>
      prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]
    );
  };

  const handleAIGenerate = async () => {
    if (!productName.trim()) {
      setError('제품명을 입력해주세요.');
      return;
    }
    const validIngredients = ingredients.filter(i => i.name.trim());
    if (validIngredients.length === 0) {
      setError('원재료를 최소 1개 입력해주세요.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await api.ai.generateLabel({
        productName,
        productType,
        ingredients: validIngredients.map(i => ({
          name: i.name,
          ratio: i.ratio || '0',
          origin: i.origin,
        })),
        servingSize,
        servingUnit,
        totalContent,
        totalUnit,
        targetMarkets,
      });
      setAiResult(data.generated);

      // AI 결과로 영양성분 자동 채우기
      if (data.generated?.nutritionInfo) {
        const ni = data.generated.nutritionInfo;
        setNutrition({
          calories: String(ni.calories ?? ''),
          carbohydrates: String(ni.carbohydrates ?? ''),
          sugars: String(ni.sugars ?? ''),
          dietaryFiber: String(ni.dietaryFiber ?? ''),
          protein: String(ni.protein ?? ''),
          totalFat: String(ni.totalFat ?? ''),
          saturatedFat: String(ni.saturatedFat ?? ''),
          transFat: String(ni.transFat ?? ''),
          cholesterol: String(ni.cholesterol ?? ''),
          sodium: String(ni.sodium ?? ''),
          vitaminA: String(ni.vitaminA ?? ''),
          vitaminC: String(ni.vitaminC ?? ''),
          calcium: String(ni.calcium ?? ''),
          iron: String(ni.iron ?? ''),
        });
      }

      // 알레르기 정보 자동 업데이트
      if (data.generated?.allergens?.korea) {
        const allergenList = data.generated.allergens.korea;
        setIngredients(prev =>
          prev.map(ing => {
            const hasAllergen = allergenList.some((a: string) =>
              ing.name.includes(a) || a.includes(ing.name)
            );
            return hasAllergen ? { ...ing, allergen: true, allergenInfo: ing.allergenInfo || allergenList.join(', ') } : ing;
          })
        );
      }

      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplianceCheck = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.ai.checkCompliance({
        productName,
        productType,
        ingredients: ingredients.filter(i => i.name.trim()),
        nutritionInfo: Object.fromEntries(
          Object.entries(nutrition).map(([k, v]) => [k, v ? parseFloat(v) : null])
        ),
        allergens: aiResult?.allergens,
        servingSize,
        servingUnit,
        totalContent,
        totalUnit,
        storageInstructions: aiResult?.storageInstructions,
        targetMarkets,
      });
      setComplianceResult(data.compliance);
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const nutritionForPreview = Object.fromEntries(
    Object.entries(nutrition).map(([k, v]) => [k, v ? parseFloat(v) : null])
  );

  const currentHealthClaims = analyzeHealthClaims(
    nutritionForPreview,
    servingSize ? parseFloat(servingSize) : null,
  );

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      // AI 주의사항 정리
      const aiNotes: any = {};
      if (aiResult?.precautions) aiNotes.precautions = aiResult.precautions;
      if (aiResult?.storageInstructions) aiNotes.storageInstructions = aiResult.storageInstructions;
      if (aiResult?.regulatoryText) aiNotes.regulatoryText = aiResult.regulatoryText;
      if (complianceResult) aiNotes.compliance = complianceResult;

      const data = await api.labels.create({
        productName,
        productType: productType || null,
        salesChannel: salesChannel || null,
        servingSize: servingSize || null,
        servingUnit,
        totalContent: totalContent || null,
        totalUnit,
        nutritionInfo: nutrition,
        ingredients: ingredients
          .filter(ing => ing.name.trim())
          .map(ing => ({ ...ing, ratio: ing.ratio || '0' })),
        healthClaims: currentHealthClaims,
        aiNotes: Object.keys(aiNotes).length > 0 ? aiNotes : null,
        labelSnapshot: aiResult || null,
      });
      router.push(`/labels/${data.label.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      {/* 스텝 인디케이터 */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => i <= step ? setStep(i) : null}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${
                  i === step
                    ? 'bg-blue-600 text-white'
                    : i < step
                    ? 'bg-green-500 text-white cursor-pointer'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </button>
              <span className={`ml-2 text-xs hidden sm:inline ${i === step ? 'text-blue-600 font-bold' : 'text-gray-500'}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 sm:w-16 h-0.5 mx-2 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 0: 템플릿 선택 */}
      {step === 0 && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">새 표기사항 작성</h1>
          <p className="text-gray-500 mb-6">샘플 템플릿으로 시작하거나 직접 입력하세요.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {SAMPLE_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="card text-left hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="text-3xl mb-2">{t.emoji}</div>
                <h3 className="font-bold text-gray-900">{t.name}</h3>
                <p className="text-sm text-gray-500">{t.productType}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {t.ingredients.length}개 원재료 | {t.servingSize}{t.servingUnit} 기준
                </p>
              </button>
            ))}
          </div>

          <div className="text-center">
            <button onClick={() => setStep(1)} className="btn-secondary">
              직접 입력하기
            </button>
          </div>
        </div>
      )}

      {/* Step 1: 기본 정보 입력 */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 제품 기본 정보 */}
            <div className="card">
              <h2 className="text-lg font-bold mb-4">제품 기본 정보</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제품명 *</label>
                  <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
                    className="input-field" placeholder="제품명을 입력하세요" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">식품유형</label>
                  <input type="text" value={productType} onChange={e => setProductType(e.target.value)}
                    className="input-field" placeholder="과자, 음료, 유제품 등" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">판매채널</label>
                  <input type="text" value={salesChannel} onChange={e => setSalesChannel(e.target.value)}
                    className="input-field" placeholder="온라인, 오프라인, 수출 등" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">총 내용량</label>
                  <div className="flex gap-2">
                    <input type="number" value={totalContent} onChange={e => setTotalContent(e.target.value)}
                      className="input-field flex-1" placeholder="0" step="any" />
                    <select value={totalUnit} onChange={e => setTotalUnit(e.target.value)} className="input-field w-20">
                      <option value="g">g</option><option value="ml">ml</option>
                      <option value="kg">kg</option><option value="L">L</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1회 제공량</label>
                  <div className="flex gap-2">
                    <input type="number" value={servingSize} onChange={e => setServingSize(e.target.value)}
                      className="input-field flex-1" placeholder="0" step="any" />
                    <select value={servingUnit} onChange={e => setServingUnit(e.target.value)} className="input-field w-20">
                      <option value="g">g</option><option value="ml">ml</option>
                      <option value="개">개</option><option value="포">포</option><option value="정">정</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 대상 시장 */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">대상 시장 (복수 선택)</label>
                <div className="flex gap-3">
                  {[
                    { id: 'korea', flag: '🇰🇷', name: '한국' },
                    { id: 'us', flag: '🇺🇸', name: '미국' },
                    { id: 'japan', flag: '🇯🇵', name: '일본' },
                  ].map(m => (
                    <button key={m.id} type="button" onClick={() => toggleMarket(m.id)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        targetMarkets.includes(m.id)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {m.flag} {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 원재료 */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">배합비 (원재료)</h2>
                <button type="button" onClick={addIngredient} className="btn-secondary text-sm">+ 원재료 추가</button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
                  <div className="col-span-3">원재료명</div>
                  <div className="col-span-2">배합비(%)</div>
                  <div className="col-span-2">원산지</div>
                  <div className="col-span-2">알레르기</div>
                  <div className="col-span-2">알레르기 정보</div>
                  <div className="col-span-1"></div>
                </div>
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <input type="text" value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)}
                        className="input-field text-sm" placeholder="원재료명" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" value={ing.ratio} onChange={e => updateIngredient(idx, 'ratio', e.target.value)}
                        className="input-field text-sm" placeholder="0" step="any" min="0" max="100" />
                    </div>
                    <div className="col-span-2">
                      <input type="text" value={ing.origin} onChange={e => updateIngredient(idx, 'origin', e.target.value)}
                        className="input-field text-sm" placeholder="국산" />
                    </div>
                    <div className="col-span-2 flex items-center">
                      <input type="checkbox" checked={ing.allergen}
                        onChange={e => updateIngredient(idx, 'allergen', e.target.checked)} className="w-4 h-4 mr-1" />
                      <span className="text-xs">해당</span>
                    </div>
                    <div className="col-span-2">
                      <input type="text" value={ing.allergenInfo}
                        onChange={e => updateIngredient(idx, 'allergenInfo', e.target.value)}
                        className="input-field text-sm" placeholder="대두, 밀 등" disabled={!ing.allergen} />
                    </div>
                    <div className="col-span-1">
                      {ingredients.length > 1 && (
                        <button type="button" onClick={() => removeIngredient(idx)}
                          className="text-red-400 hover:text-red-600 text-sm">삭제</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 영양성분 (수동 입력 가능) */}
            <div className="card">
              <h2 className="text-lg font-bold mb-2">영양성분 정보</h2>
              <p className="text-xs text-gray-500 mb-4">직접 입력하거나, AI가 자동으로 추정합니다.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {[
                  { key: 'calories', label: '열량 (kcal)' },
                  { key: 'carbohydrates', label: '탄수화물 (g)' },
                  { key: 'sugars', label: '당류 (g)' },
                  { key: 'dietaryFiber', label: '식이섬유 (g)' },
                  { key: 'protein', label: '단백질 (g)' },
                  { key: 'totalFat', label: '지방 (g)' },
                  { key: 'saturatedFat', label: '포화지방 (g)' },
                  { key: 'transFat', label: '트랜스지방 (g)' },
                  { key: 'cholesterol', label: '콜레스테롤 (mg)' },
                  { key: 'sodium', label: '나트륨 (mg)' },
                  { key: 'vitaminA', label: '비타민A (μg RE)' },
                  { key: 'vitaminC', label: '비타민C (mg)' },
                  { key: 'calcium', label: '칼슘 (mg)' },
                  { key: 'iron', label: '철 (mg)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input type="number" value={nutrition[key] || ''}
                      onChange={e => handleNutritionChange(key, e.target.value)}
                      className="input-field text-sm" placeholder="0" step="any" min="0" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="btn-secondary">이전</button>
              <button onClick={handleAIGenerate} disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {loading ? (
                  <><span className="animate-spin">⏳</span> AI 분석 중...</>
                ) : (
                  <><span>🤖</span> AI로 라벨 생성</>
                )}
              </button>
              <button onClick={() => { setStep(4); }} className="btn-secondary">AI 없이 저장</button>
            </div>
          </div>

          {/* 오른쪽: 미리보기 */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <div className="card">
                <h3 className="text-lg font-bold mb-4">미리보기</h3>
                <NutritionLabel
                  productName={productName || '제품명'}
                  servingSize={servingSize ? parseFloat(servingSize) : null}
                  servingUnit={servingUnit}
                  totalContent={totalContent ? parseFloat(totalContent) : null}
                  totalUnit={totalUnit}
                  nutritionInfo={nutritionForPreview}
                />
              </div>
              <div className="card">
                <h3 className="text-sm font-bold mb-2">원재료명 표기</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {ingredients
                    .filter(i => i.name.trim())
                    .sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'))
                    .map(i => {
                      let t = i.name;
                      if (i.origin) t += `(${i.origin})`;
                      if (i.ratio) t += ` ${i.ratio}%`;
                      return t;
                    })
                    .join(', ') || '원재료를 입력해주세요.'}
                </p>
                {ingredients.some(i => i.allergen && i.allergenInfo) && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded text-xs">
                    <strong>알레르기 유발물질:</strong>{' '}
                    {ingredients.filter(i => i.allergen && i.allergenInfo).map(i => i.allergenInfo).join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: AI 생성 결과 */}
      {step === 2 && aiResult && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">AI 생성 결과</h1>
          <p className="text-gray-500">AI가 생성한 라벨 정보를 확인하고 수정하세요.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 영양성분 */}
            <div className="card">
              <h3 className="text-lg font-bold mb-4">영양성분 (AI 추정)</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs text-yellow-700">
                AI가 추정한 값입니다. 실제 영양분석 결과로 수정해주세요.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'calories', label: '열량', unit: 'kcal' },
                  { key: 'carbohydrates', label: '탄수화물', unit: 'g' },
                  { key: 'sugars', label: '당류', unit: 'g' },
                  { key: 'dietaryFiber', label: '식이섬유', unit: 'g' },
                  { key: 'protein', label: '단백질', unit: 'g' },
                  { key: 'totalFat', label: '지방', unit: 'g' },
                  { key: 'saturatedFat', label: '포화지방', unit: 'g' },
                  { key: 'transFat', label: '트랜스지방', unit: 'g' },
                  { key: 'cholesterol', label: '콜레스테롤', unit: 'mg' },
                  { key: 'sodium', label: '나트륨', unit: 'mg' },
                ].map(({ key, label, unit }) => (
                  <div key={key} className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">{label}</span>
                    <div className="flex items-center gap-1">
                      <input type="number" value={nutrition[key] || ''}
                        onChange={e => handleNutritionChange(key, e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm" step="any" />
                      <span className="text-gray-400 text-xs w-8">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 알레르기 & 보관 */}
            <div className="space-y-4">
              {aiResult.allergens && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">알레르기 유발물질</h3>
                  {targetMarkets.includes('korea') && aiResult.allergens.korea && (
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-500">🇰🇷 한국</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiResult.allergens.korea.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {targetMarkets.includes('us') && aiResult.allergens.us && (
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-500">🇺🇸 미국</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiResult.allergens.us.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {targetMarkets.includes('japan') && aiResult.allergens.japan && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">🇯🇵 일본</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aiResult.allergens.japan.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiResult.storageInstructions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">보관방법</h3>
                  {targetMarkets.includes('korea') && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-500">🇰🇷</span>
                      <p className="text-sm">{aiResult.storageInstructions.korea}</p>
                    </div>
                  )}
                  {targetMarkets.includes('us') && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-500">🇺🇸</span>
                      <p className="text-sm">{aiResult.storageInstructions.us}</p>
                    </div>
                  )}
                  {targetMarkets.includes('japan') && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">🇯🇵</span>
                      <p className="text-sm">{aiResult.storageInstructions.japan}</p>
                    </div>
                  )}
                </div>
              )}

              {aiResult.precautions && (
                <div className="card">
                  <h3 className="text-lg font-bold mb-3">주의사항</h3>
                  {targetMarkets.map(market => {
                    const flag = market === 'korea' ? '🇰🇷' : market === 'us' ? '🇺🇸' : '🇯🇵';
                    const items = aiResult.precautions?.[market];
                    if (!items?.length) return null;
                    return (
                      <div key={market} className="mb-2">
                        <span className="text-xs font-medium text-gray-500">{flag}</span>
                        <ul className="text-sm text-gray-700 list-disc list-inside">
                          {items.map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 강조 표기사항 분석 */}
          <HealthClaimsPanel claims={currentHealthClaims} />

          {/* 규정별 원재료 표기 */}
          {aiResult.regulatoryText && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4">국가별 원재료 표기</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {targetMarkets.map(market => {
                  const flag = market === 'korea' ? '🇰🇷 한국 (MFDS)' : market === 'us' ? '🇺🇸 미국 (FDA)' : '🇯🇵 일본 (CAA)';
                  const rt = aiResult.regulatoryText?.[market];
                  if (!rt) return null;
                  return (
                    <div key={market} className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-bold text-sm mb-2">{flag}</h4>
                      <p className="text-xs text-gray-500 mb-1">식품유형: {rt.foodType}</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{rt.ingredientsList}</p>
                      {rt.allergenStatement && (
                        <p className="text-xs text-red-600 mt-2 font-medium">{rt.allergenStatement}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="btn-secondary">이전 (수정)</button>
            <button onClick={handleComplianceCheck} disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="animate-spin">⏳</span> 규정 검토 중...</>
              ) : (
                <><span>📋</span> 규정 준수 검토</>
              )}
            </button>
            <button onClick={() => setStep(4)} className="btn-secondary">검토 건너뛰기</button>
          </div>
        </div>
      )}

      {/* Step 3: 규정 준수 검토 */}
      {step === 3 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">규정 준수 검토 결과</h1>
          {complianceResult && <ComplianceCheck result={complianceResult} targetMarkets={targetMarkets} />}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary">이전 (수정)</button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1">
              최종 결과 확인
            </button>
          </div>
        </div>
      )}

      {/* Step 4: 최종 결과 - 라벨 디자인 + 강조표기 + 저장 */}
      {step === 4 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-gray-900">최종 라벨 결과</h1>

          {/* 포맷 선택 */}
          <div className="flex gap-3">
            {[
              { id: 'korea' as const, flag: '🇰🇷', name: '한국 표기' },
              { id: 'us' as const, flag: '🇺🇸', name: 'US Label' },
              { id: 'japan' as const, flag: '🇯🇵', name: '日本表示' },
            ].map(f => (
              <button key={f.id} onClick={() => setLabelFormat(f.id)}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  labelFormat === f.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-500'
                }`}>
                {f.flag} {f.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 인쇄용 라벨 */}
            <div className="lg:col-span-2 flex justify-center">
              <PrintableLabel
                format={labelFormat}
                productName={productName}
                productType={productType}
                servingSize={servingSize ? parseFloat(servingSize) : null}
                servingUnit={servingUnit}
                totalContent={totalContent ? parseFloat(totalContent) : null}
                totalUnit={totalUnit}
                nutritionInfo={nutritionForPreview}
                ingredients={ingredients.filter(i => i.name.trim())}
                aiResult={aiResult}
              />
            </div>

            {/* 사이드: 강조 표기 + AI 주의사항 요약 */}
            <div className="space-y-4">
              {/* 강조 표기 요약 */}
              <div className="card">
                <h3 className="text-sm font-bold mb-3">강조 표기 가능 항목</h3>
                {getEligibleClaims(currentHealthClaims).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {getEligibleClaims(currentHealthClaims).map(c => (
                      <span key={c.id} className={`px-2 py-1 rounded-full text-xs font-bold ${getClaimBadgeColor(c)}`}>
                        {c.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">해당하는 강조 표기사항이 없습니다.</p>
                )}
              </div>

              {/* AI 주의사항 */}
              {aiResult?.precautions?.korea && aiResult.precautions.korea.length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-bold mb-3">AI 검수 주의사항</h3>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {aiResult.precautions.korea.map((p: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-yellow-500 mt-0.5">&#9888;</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 규정 검토 요약 */}
              {complianceResult?.korea && (
                <div className="card">
                  <h3 className="text-sm font-bold mb-3">규정 검토 결과</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${complianceResult.korea.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {complianceResult.korea.passed ? '통과' : '미통과'}
                    </span>
                    <span className="text-xs text-gray-500">
                      점수: {complianceResult.korea.score}/100
                    </span>
                  </div>
                  {complianceResult.korea.issues?.length > 0 && (
                    <ul className="text-xs text-gray-600 space-y-1">
                      {complianceResult.korea.issues.slice(0, 3).map((issue: any, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className={issue.severity === 'error' ? 'text-red-500' : 'text-yellow-500'}>
                            {issue.severity === 'error' ? '●' : '▲'}
                          </span>
                          <span>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={() => step > 0 ? setStep(step - 1) : null} className="btn-secondary">
              이전
            </button>
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
              🖨️ 인쇄하기
            </button>
            <button onClick={handleSave} disabled={loading}
              className="btn-primary flex items-center gap-2">
              {loading ? '저장 중...' : '💾 저장하기'}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
