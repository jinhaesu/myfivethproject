'use client';

import { analyzeHealthClaims, getEligibleClaims } from '@/lib/healthClaims';
import { analyzeOriginRequirements } from '@/lib/originRules';

interface Ingredient {
  name: string;
  ratio: string;
  origin: string;
  allergen: boolean;
  allergenInfo: string;
}

interface Props {
  format: 'korea' | 'us' | 'japan';
  productName: string;
  productType: string;
  servingSize: number | null;
  servingUnit: string;
  totalContent: number | null;
  totalUnit: string;
  nutritionInfo: Record<string, number | null>;
  ingredients: Ingredient[];
  aiResult?: any;
}

const KR_DV: Record<string, number> = {
  calories: 2000, carbohydrates: 324, sugars: 100, dietaryFiber: 25,
  protein: 55, totalFat: 54, saturatedFat: 15, cholesterol: 300,
  sodium: 2000, vitaminA: 700, vitaminC: 100, calcium: 700, iron: 12,
};

const US_DV: Record<string, number> = {
  calories: 2000, totalFat: 78, saturatedFat: 20, cholesterol: 300,
  sodium: 2300, carbohydrates: 275, dietaryFiber: 28, addedSugars: 50,
  protein: 50, vitaminD: 20, calcium: 1300, iron: 18, potassium: 4700,
};

function pct(val: number | null | undefined, dv: number): string {
  if (!val || dv <= 0) return '0%';
  return `${Math.round((val / dv) * 100)}%`;
}

function pctNum(val: number | null | undefined, dv: number): number {
  if (!val || dv <= 0) return 0;
  return Math.round((val / dv) * 100);
}

function fmt(val: number | null | undefined, unit: string = 'g'): string {
  if (val == null) return `0${unit}`;
  return `${val}${unit}`;
}

/**
 * 한국 표준 식품표시사항 라벨
 * - 식약처 「식품등의 표시기준」 에 따른 표준 양식
 * - 원재료명에는 배합비(%) 미표기 (내부용 데이터)
 * - 원재료는 많이 사용한 순서대로 표기
 * - 알레르기 유발물질은 별도 강조 표시
 */
function KoreaLabel({ productName, productType, servingSize, servingUnit, totalContent, totalUnit, nutritionInfo: ni, ingredients, aiResult }: Props) {
  const sorted = [...ingredients].sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'));
  const allergenInfos = sorted.filter(i => i.allergen && i.allergenInfo).map(i => i.allergenInfo);
  const allergenList = Array.from(new Set(allergenInfos.flatMap(a => a.split(',')))).map(a => a.trim()).filter(Boolean);
  const storage = aiResult?.storageInstructions?.korea || '직사광선을 피하고 서늘한 곳에 보관';
  const precautions = aiResult?.precautions?.korea || [];

  const claims = analyzeHealthClaims(ni, servingSize);
  const eligible = getEligibleClaims(claims);

  // 원산지 표기 분석 - 한국 「농수산물의 원산지 표시 등에 관한 법률」 기준
  // 모든 원재료에 원산지를 표기하는 것이 아니라, 법적 의무 대상만 표기
  const originAnalysis = analyzeOriginRequirements(
    sorted.map(i => ({ name: i.name, ratio: i.ratio, origin: i.origin })),
    productType,
    productName,
  );

  // 원재료명 표기 (배합비 % 미표시 + 원산지는 의무 대상만)
  const ingredientText = sorted.map(i => {
    let t = i.name;
    const req = originAnalysis.find(r => r.ingredientName === i.name.trim());
    if (req?.required && i.origin) {
      t += `(${i.origin})`;
    }
    return t;
  }).join(', ');

  return (
    <div className="kr-label" id="printable-label">
      {/* ── 상단: 제품 기본 정보 테이블 ── */}
      <table className="kr-info-table">
        <tbody>
          <tr>
            <th>제품명</th>
            <td colSpan={3}>
              <span className="kr-pname">{productName}</span>
              {eligible.length > 0 && (
                <span className="kr-claims-inline">
                  {eligible.map(c => (
                    <span key={c.id} className={`kr-badge ${c.category}`}>{c.name}</span>
                  ))}
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th>식품유형</th>
            <td>{productType || '-'}</td>
            <th>내용량</th>
            <td>{totalContent && totalUnit ? `${totalContent}${totalUnit}` : '-'}</td>
          </tr>
        </tbody>
      </table>

      {/* ── 원재료명 ── */}
      <div className="kr-ingr-box">
        <div className="kr-ingr-title">원재료명</div>
        <div className="kr-ingr-text">{ingredientText}</div>
      </div>

      {/* ── 영양정보 (파란 헤더 표준 양식) ── */}
      <div className="kr-nut-box">
        <div className="kr-nut-header">
          <div className="kr-nut-header-left">영양정보</div>
          <div className="kr-nut-header-right">1일 영양성분기준치에<br/>대한 비율(%)</div>
        </div>

        <div className="kr-nut-serving-row">
          <span>{servingSize && servingUnit ? `1회 제공량 ${servingSize}${servingUnit}` : ''}</span>
          <span>{totalContent && totalUnit ? `총 내용량 ${totalContent}${totalUnit}` : ''}</span>
        </div>

        <div className="kr-nut-cal">
          열량 <strong>{ni.calories || 0}kcal</strong>
        </div>

        <table className="kr-nut-table">
          <thead>
            <tr>
              <th className="kr-th-name"></th>
              <th className="kr-th-val"></th>
              <th className="kr-th-dv">%기준치</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="kr-td-name">나트륨</td>
              <td className="kr-td-val">{fmt(ni.sodium, 'mg')}</td>
              <td className="kr-td-dv">{pct(ni.sodium, KR_DV.sodium)}</td>
            </tr>
            <tr>
              <td className="kr-td-name">탄수화물</td>
              <td className="kr-td-val">{fmt(ni.carbohydrates)}</td>
              <td className="kr-td-dv">{pct(ni.carbohydrates, KR_DV.carbohydrates)}</td>
            </tr>
            <tr>
              <td className="kr-td-name kr-indent">당류</td>
              <td className="kr-td-val">{fmt(ni.sugars)}</td>
              <td className="kr-td-dv">{pct(ni.sugars, KR_DV.sugars)}</td>
            </tr>
            <tr>
              <td className="kr-td-name kr-indent">식이섬유</td>
              <td className="kr-td-val">{fmt(ni.dietaryFiber)}</td>
              <td className="kr-td-dv">{pct(ni.dietaryFiber, KR_DV.dietaryFiber)}</td>
            </tr>
            <tr>
              <td className="kr-td-name">지방</td>
              <td className="kr-td-val">{fmt(ni.totalFat)}</td>
              <td className="kr-td-dv">{pct(ni.totalFat, KR_DV.totalFat)}</td>
            </tr>
            <tr>
              <td className="kr-td-name kr-indent">트랜스지방</td>
              <td className="kr-td-val">{fmt(ni.transFat)}</td>
              <td className="kr-td-dv"></td>
            </tr>
            <tr>
              <td className="kr-td-name kr-indent">포화지방</td>
              <td className="kr-td-val">{fmt(ni.saturatedFat)}</td>
              <td className="kr-td-dv">{pct(ni.saturatedFat, KR_DV.saturatedFat)}</td>
            </tr>
            <tr>
              <td className="kr-td-name">콜레스테롤</td>
              <td className="kr-td-val">{fmt(ni.cholesterol, 'mg')}</td>
              <td className="kr-td-dv">{pct(ni.cholesterol, KR_DV.cholesterol)}</td>
            </tr>
            <tr>
              <td className="kr-td-name">단백질</td>
              <td className="kr-td-val">{fmt(ni.protein)}</td>
              <td className="kr-td-dv">{pct(ni.protein, KR_DV.protein)}</td>
            </tr>
          </tbody>
        </table>

        <div className="kr-nut-note">
          * %영양성분기준치 : 1일 영양성분기준치에 대한 비율
        </div>
      </div>

      {/* ── 알레르기 유발물질 ── */}
      {allergenList.length > 0 && (
        <div className="kr-allergen-box">
          <strong>※ 알레르기 유발물질:</strong> {allergenList.join(', ')} 함유
        </div>
      )}

      {/* ── 보관방법 ── */}
      <div className="kr-bottom-row">
        <span><strong>보관방법:</strong> {storage}</span>
      </div>

      {/* ── 주의사항 ── */}
      {precautions.length > 0 && (
        <div className="kr-bottom-row kr-precaution">
          <strong>주의사항:</strong>
          <ul>
            {precautions.map((p: string, i: number) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function USLabel({ productName, servingSize, servingUnit, totalContent, totalUnit, nutritionInfo: ni, ingredients, aiResult }: Props) {
  const sorted = [...ingredients].sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'));
  const allergens = aiResult?.allergens?.us || sorted.filter(i => i.allergen).map(i => i.allergenInfo);

  return (
    <div className="printable-label us-label" id="printable-label">
      <div className="nf-title">Nutrition Facts</div>
      <div className="nf-divider thick" />
      <div className="nf-serving">
        {totalContent && totalUnit && <div className="nf-servings">{Math.round((totalContent || 0) / (servingSize || 1))} servings per container</div>}
        <div className="nf-serving-size">
          <span className="bold">Serving size</span>
          <span className="bold">{servingSize}{servingUnit}</span>
        </div>
      </div>
      <div className="nf-divider extra-thick" />
      <div className="nf-calories-row">
        <span className="nf-calories-label">Calories</span>
        <span className="nf-calories-value">{ni.calories || 0}</span>
      </div>
      <div className="nf-divider medium" />
      <div className="nf-dv-header">% Daily Value*</div>
      <div className="nf-divider thin" />

      <div className="nf-row bold"><span>Total Fat {fmt(ni.totalFat)}</span><span>{pct(ni.totalFat, US_DV.totalFat)}</span></div>
      <div className="nf-row indent"><span>Saturated Fat {fmt(ni.saturatedFat)}</span><span>{pct(ni.saturatedFat, US_DV.saturatedFat)}</span></div>
      <div className="nf-row indent"><span><i>Trans</i> Fat {fmt(ni.transFat)}</span><span></span></div>
      <div className="nf-divider thin" />
      <div className="nf-row bold"><span>Cholesterol {fmt(ni.cholesterol, 'mg')}</span><span>{pct(ni.cholesterol, US_DV.cholesterol)}</span></div>
      <div className="nf-divider thin" />
      <div className="nf-row bold"><span>Sodium {fmt(ni.sodium, 'mg')}</span><span>{pct(ni.sodium, US_DV.sodium)}</span></div>
      <div className="nf-divider thin" />
      <div className="nf-row bold"><span>Total Carbohydrate {fmt(ni.carbohydrates)}</span><span>{pct(ni.carbohydrates, US_DV.carbohydrates)}</span></div>
      <div className="nf-row indent"><span>Dietary Fiber {fmt(ni.dietaryFiber)}</span><span>{pct(ni.dietaryFiber, US_DV.dietaryFiber)}</span></div>
      <div className="nf-row indent"><span>Total Sugars {fmt(ni.sugars)}</span><span></span></div>
      <div className="nf-divider thin" />
      <div className="nf-row bold"><span>Protein {fmt(ni.protein)}</span><span></span></div>
      <div className="nf-divider thick" />
      {ni.calcium && <div className="nf-row"><span>Calcium {fmt(ni.calcium, 'mg')}</span><span>{pct(ni.calcium, US_DV.calcium)}</span></div>}
      {ni.iron && <div className="nf-row"><span>Iron {fmt(ni.iron, 'mg')}</span><span>{pct(ni.iron, US_DV.iron)}</span></div>}
      <div className="nf-divider thin" />
      <div className="nf-footnote">* The % Daily Value tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</div>

      <div className="nf-ingredients">
        <span className="bold">INGREDIENTS: </span>
        {sorted.map(i => i.name.toUpperCase()).join(', ')}.
      </div>

      {allergens.length > 0 && (
        <div className="nf-allergens">
          <span className="bold">Contains: </span>
          {Array.isArray(allergens) ? allergens.join(', ') : allergens}.
        </div>
      )}
    </div>
  );
}

function JapanLabel({ productName, productType, servingSize, servingUnit, totalContent, totalUnit, nutritionInfo: ni, ingredients, aiResult }: Props) {
  const sorted = [...ingredients].sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'));
  const allergens = aiResult?.allergens?.japan || [];
  const storage = aiResult?.storageInstructions?.japan || '直射日光を避け、涼しい場所に保存してください。';

  return (
    <div className="printable-label japan-label" id="printable-label">
      <div className="jp-header">
        <h1>{productName}</h1>
      </div>

      <table className="jp-info-table">
        <tbody>
          <tr><th>名称</th><td>{productType || productName}</td></tr>
          <tr><th>原材料名</th><td>{sorted.map(i => i.name).join('、')}{allergens.length > 0 ? `（一部に${allergens.join('・')}を含む）` : ''}</td></tr>
          <tr><th>内容量</th><td>{totalContent}{totalUnit}</td></tr>
          <tr><th>保存方法</th><td>{storage}</td></tr>
        </tbody>
      </table>

      <div className="jp-nutrition">
        <div className="jp-nut-title">栄養成分表示（{servingSize}{servingUnit}当たり）</div>
        <table className="jp-nut-table">
          <tbody>
            <tr><td>エネルギー</td><td>{ni.calories || 0}kcal</td></tr>
            <tr><td>たんぱく質</td><td>{fmt(ni.protein)}</td></tr>
            <tr><td>脂質</td><td>{fmt(ni.totalFat)}</td></tr>
            <tr><td>炭水化物</td><td>{fmt(ni.carbohydrates)}</td></tr>
            <tr><td>食塩相当量</td><td>{ni.sodium ? `${(ni.sodium / 400).toFixed(1)}g` : '0g'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PrintableLabel(props: Props) {
  switch (props.format) {
    case 'us': return <USLabel {...props} />;
    case 'japan': return <JapanLabel {...props} />;
    default: return <KoreaLabel {...props} />;
  }
}
