'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import NutritionLabel from '@/components/NutritionLabel';
import { api } from '@/lib/api';

interface Ingredient {
  name: string;
  ratio: string;
  origin: string;
  allergen: boolean;
  allergenInfo: string;
}

const EMPTY_INGREDIENT: Ingredient = {
  name: '',
  ratio: '',
  origin: '',
  allergen: false,
  allergenInfo: '',
};

export default function NewLabelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // 제품 기본 정보
  const [productName, setProductName] = useState('');
  const [salesChannel, setSalesChannel] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState('g');
  const [totalContent, setTotalContent] = useState('');
  const [totalUnit, setTotalUnit] = useState('g');

  // 영양성분 정보
  const [nutrition, setNutrition] = useState({
    calories: '',
    carbohydrates: '',
    sugars: '',
    dietaryFiber: '',
    protein: '',
    totalFat: '',
    saturatedFat: '',
    transFat: '',
    cholesterol: '',
    sodium: '',
    vitaminA: '',
    vitaminC: '',
    calcium: '',
    iron: '',
  });

  // 배합비 (원재료)
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { ...EMPTY_INGREDIENT },
  ]);

  const handleNutritionChange = (key: string, value: string) => {
    setNutrition((prev) => ({ ...prev, [key]: value }));
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: any) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      setError('제품명을 입력해주세요.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await api.labels.create({
        productName,
        salesChannel: salesChannel || null,
        servingSize: servingSize || null,
        servingUnit,
        totalContent: totalContent || null,
        totalUnit,
        nutritionInfo: nutrition,
        ingredients: ingredients
          .filter((ing) => ing.name.trim())
          .map((ing) => ({
            ...ing,
            ratio: ing.ratio || '0',
          })),
      });
      router.push(`/labels/${data.label.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const nutritionForPreview = Object.fromEntries(
    Object.entries(nutrition).map(([k, v]) => [k, v ? parseFloat(v) : null])
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">새 표기사항 작성</h1>
        <p className="text-sm text-gray-500 mt-1">
          영양성분 정보와 배합비를 입력하여 표기사항을 생성합니다.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 왼쪽: 입력 폼 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 제품 기본 정보 */}
            <div className="card">
              <h2 className="text-lg font-bold mb-4">제품 기본 정보</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제품명 *
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="input-field"
                    placeholder="제품명을 입력하세요"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    판매채널
                  </label>
                  <input
                    type="text"
                    value={salesChannel}
                    onChange={(e) => setSalesChannel(e.target.value)}
                    className="input-field"
                    placeholder="온라인, 오프라인, 수출 등"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    총 내용량
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={totalContent}
                      onChange={(e) => setTotalContent(e.target.value)}
                      className="input-field flex-1"
                      placeholder="0"
                      step="any"
                    />
                    <select
                      value={totalUnit}
                      onChange={(e) => setTotalUnit(e.target.value)}
                      className="input-field w-20"
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="kg">kg</option>
                      <option value="L">L</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    1회 제공량
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={servingSize}
                      onChange={(e) => setServingSize(e.target.value)}
                      className="input-field flex-1"
                      placeholder="0"
                      step="any"
                    />
                    <select
                      value={servingUnit}
                      onChange={(e) => setServingUnit(e.target.value)}
                      className="input-field w-20"
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="개">개</option>
                      <option value="포">포</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 영양성분 정보 */}
            <div className="card">
              <h2 className="text-lg font-bold mb-4">영양성분 정보</h2>
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {label}
                    </label>
                    <input
                      type="number"
                      value={nutrition[key as keyof typeof nutrition]}
                      onChange={(e) => handleNutritionChange(key, e.target.value)}
                      className="input-field text-sm"
                      placeholder="0"
                      step="any"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 배합비 (원재료) */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">배합비 (원재료)</h2>
                <button type="button" onClick={addIngredient} className="btn-secondary text-sm">
                  + 원재료 추가
                </button>
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
                      <input
                        type="text"
                        value={ing.name}
                        onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                        className="input-field text-sm"
                        placeholder="원재료명"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={ing.ratio}
                        onChange={(e) => updateIngredient(idx, 'ratio', e.target.value)}
                        className="input-field text-sm"
                        placeholder="0"
                        step="any"
                        min="0"
                        max="100"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={ing.origin}
                        onChange={(e) => updateIngredient(idx, 'origin', e.target.value)}
                        className="input-field text-sm"
                        placeholder="국산"
                      />
                    </div>
                    <div className="col-span-2 flex items-center">
                      <input
                        type="checkbox"
                        checked={ing.allergen}
                        onChange={(e) => updateIngredient(idx, 'allergen', e.target.checked)}
                        className="w-4 h-4 mr-1"
                      />
                      <span className="text-xs">해당</span>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={ing.allergenInfo}
                        onChange={(e) => updateIngredient(idx, 'allergenInfo', e.target.value)}
                        className="input-field text-sm"
                        placeholder="대두, 밀 등"
                        disabled={!ing.allergen}
                      />
                    </div>
                    <div className="col-span-1">
                      {ingredients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredient(idx)}
                          className="text-red-400 hover:text-red-600 text-sm"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 오른쪽: 미리보기 */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">미리보기</h2>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-sm text-blue-600 lg:hidden"
                  >
                    {showPreview ? '숨기기' : '펼치기'}
                  </button>
                </div>
                <div className={`${showPreview ? '' : 'hidden lg:block'}`}>
                  <NutritionLabel
                    productName={productName || '제품명'}
                    servingSize={servingSize ? parseFloat(servingSize) : null}
                    servingUnit={servingUnit}
                    totalContent={totalContent ? parseFloat(totalContent) : null}
                    totalUnit={totalUnit}
                    nutritionInfo={nutritionForPreview}
                  />
                </div>
              </div>

              {/* 원재료 표기 미리보기 */}
              <div className="card mt-4">
                <h3 className="text-sm font-bold mb-2">원재료명 표기</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {ingredients
                    .filter((ing) => ing.name.trim())
                    .sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'))
                    .map((ing) => {
                      let text = ing.name;
                      if (ing.origin) text += `(${ing.origin})`;
                      if (ing.ratio) text += ` ${ing.ratio}%`;
                      return text;
                    })
                    .join(', ') || '원재료를 입력해주세요.'}
                </p>
                {ingredients.some((ing) => ing.allergen && ing.allergenInfo) && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded text-xs">
                    <strong>알레르기 유발물질:</strong>{' '}
                    {ingredients
                      .filter((ing) => ing.allergen && ing.allergenInfo)
                      .map((ing) => ing.allergenInfo)
                      .join(', ')}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full"
                >
                  {loading ? '저장 중...' : '표기사항 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="btn-secondary w-full"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
