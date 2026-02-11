'use client';

interface NutritionInfo {
  calories?: number | null;
  carbohydrates?: number | null;
  sugars?: number | null;
  dietaryFiber?: number | null;
  protein?: number | null;
  totalFat?: number | null;
  saturatedFat?: number | null;
  transFat?: number | null;
  cholesterol?: number | null;
  sodium?: number | null;
  vitaminA?: number | null;
  vitaminC?: number | null;
  calcium?: number | null;
  iron?: number | null;
}

interface Props {
  productName: string;
  servingSize?: number | null;
  servingUnit?: string | null;
  totalContent?: number | null;
  totalUnit?: string | null;
  nutritionInfo: NutritionInfo | null;
}

// 한국 1일 영양성분 기준치
const DAILY_VALUES: Record<string, number> = {
  calories: 2000,
  carbohydrates: 324,
  sugars: 100,
  dietaryFiber: 25,
  protein: 55,
  totalFat: 54,
  saturatedFat: 15,
  transFat: -1, // 기준치 없음
  cholesterol: 300,
  sodium: 2000,
  vitaminA: 700,
  vitaminC: 100,
  calcium: 700,
  iron: 12,
};

function getDV(key: string, value: number | null | undefined): string | null {
  if (value == null || value === 0) return null;
  const dv = DAILY_VALUES[key];
  if (!dv || dv < 0) return null;
  return `${Math.round((value / dv) * 100)}%`;
}

function formatValue(value: number | null | undefined, unit: string = 'g'): string {
  if (value == null) return `0${unit}`;
  return `${value}${unit}`;
}

export default function NutritionLabel({
  productName,
  servingSize,
  servingUnit,
  totalContent,
  totalUnit,
  nutritionInfo,
}: Props) {
  const ni = nutritionInfo || {};

  return (
    <div className="nutrition-label bg-white">
      <div className="title">영양성분표</div>
      <div className="thick-line" />

      <div className="serving-info">
        <div className="font-bold text-sm">
          {totalContent && totalUnit
            ? `총 내용량 ${totalContent}${totalUnit}`
            : '총 내용량 -'}
        </div>
        <div className="text-xs text-gray-600">
          {servingSize && servingUnit
            ? `1회 제공량 ${servingSize}${servingUnit}`
            : '1회 제공량 -'}
        </div>
      </div>

      <div className="thick-line" />
      <div className="dv-header">%영양성분기준치</div>
      <div className="thin-line" />

      {/* 열량 */}
      <div className="row bold">
        <span>열량</span>
        <span>{formatValue(ni.calories, 'kcal')}</span>
      </div>
      <div className="medium-line" />

      {/* 탄수화물 */}
      <div className="row bold">
        <span>탄수화물</span>
        <span>
          {formatValue(ni.carbohydrates)}{' '}
          <span className="font-bold">{getDV('carbohydrates', ni.carbohydrates) || ''}</span>
        </span>
      </div>
      <div className="thin-line" />

      {/* 당류 */}
      <div className="row indent">
        <span>당류</span>
        <span>
          {formatValue(ni.sugars)}{' '}
          {getDV('sugars', ni.sugars) || ''}
        </span>
      </div>
      <div className="thin-line" />

      {/* 식이섬유 */}
      <div className="row indent">
        <span>식이섬유</span>
        <span>
          {formatValue(ni.dietaryFiber)}{' '}
          {getDV('dietaryFiber', ni.dietaryFiber) || ''}
        </span>
      </div>
      <div className="thin-line" />

      {/* 단백질 */}
      <div className="row bold">
        <span>단백질</span>
        <span>
          {formatValue(ni.protein)}{' '}
          <span className="font-bold">{getDV('protein', ni.protein) || ''}</span>
        </span>
      </div>
      <div className="medium-line" />

      {/* 지방 */}
      <div className="row bold">
        <span>지방</span>
        <span>
          {formatValue(ni.totalFat)}{' '}
          <span className="font-bold">{getDV('totalFat', ni.totalFat) || ''}</span>
        </span>
      </div>
      <div className="thin-line" />

      {/* 포화지방 */}
      <div className="row indent">
        <span>포화지방</span>
        <span>
          {formatValue(ni.saturatedFat)}{' '}
          {getDV('saturatedFat', ni.saturatedFat) || ''}
        </span>
      </div>
      <div className="thin-line" />

      {/* 트랜스지방 */}
      <div className="row indent">
        <span>트랜스지방</span>
        <span>{formatValue(ni.transFat)}</span>
      </div>
      <div className="thin-line" />

      {/* 콜레스테롤 */}
      <div className="row bold">
        <span>콜레스테롤</span>
        <span>
          {formatValue(ni.cholesterol, 'mg')}{' '}
          <span className="font-bold">{getDV('cholesterol', ni.cholesterol) || ''}</span>
        </span>
      </div>
      <div className="medium-line" />

      {/* 나트륨 */}
      <div className="row bold">
        <span>나트륨</span>
        <span>
          {formatValue(ni.sodium, 'mg')}{' '}
          <span className="font-bold">{getDV('sodium', ni.sodium) || ''}</span>
        </span>
      </div>
      <div className="thick-line" />

      <div className="text-xs text-gray-500 mt-1 text-center">
        * %영양성분기준치: 1일 영양성분기준치에 대한 비율
      </div>
    </div>
  );
}
