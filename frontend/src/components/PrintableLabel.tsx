'use client';

import { analyzeHealthClaims, getEligibleClaims } from '@/lib/healthClaims';

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

function KoreaLabel({ productName, productType, servingSize, servingUnit, totalContent, totalUnit, nutritionInfo: ni, ingredients, aiResult }: Props) {
  const sorted = [...ingredients].sort((a, b) => parseFloat(b.ratio || '0') - parseFloat(a.ratio || '0'));
  const allergenInfos = sorted.filter(i => i.allergen && i.allergenInfo).map(i => i.allergenInfo);
  const allergenList = Array.from(new Set(allergenInfos.flatMap(a => a.split(',')))).map(a => a.trim()).filter(Boolean);
  const storage = aiResult?.storageInstructions?.korea || '직사광선을 피하고 서늘한 곳에 보관';
  const precautions = aiResult?.precautions?.korea || [];

  const claims = analyzeHealthClaims(ni, servingSize);
  const eligible = getEligibleClaims(claims);

  const nutrientRows = [
    { key: 'sodium', label: '나트륨', unit: 'mg', dv: KR_DV.sodium },
    { key: 'carbohydrates', label: '탄수화물', unit: 'g', dv: KR_DV.carbohydrates },
    { key: 'sugars', label: '  당류', unit: 'g', dv: KR_DV.sugars, indent: true },
    { key: 'dietaryFiber', label: '  식이섬유', unit: 'g', dv: KR_DV.dietaryFiber, indent: true },
    { key: 'totalFat', label: '지방', unit: 'g', dv: KR_DV.totalFat },
    { key: 'transFat', label: '  트랜스지방', unit: 'g', dv: 0, indent: true },
    { key: 'saturatedFat', label: '  포화지방', unit: 'g', dv: KR_DV.saturatedFat, indent: true },
    { key: 'cholesterol', label: '콜레스테롤', unit: 'mg', dv: KR_DV.cholesterol },
    { key: 'protein', label: '단백질', unit: 'g', dv: KR_DV.protein },
  ];

  return (
    <div className="kr-label" id="printable-label">
      {/* 강조 표기 배지 */}
      {eligible.length > 0 && (
        <div className="kr-claims">
          {eligible.map(c => (
            <span key={c.id} className={`kr-claim-badge ${c.category === 'positive' ? 'positive' : 'negative'}`}>
              {c.name}
            </span>
          ))}
        </div>
      )}

      {/* 제품 정보 헤더 */}
      <div className="kr-header">
        <div className="kr-product-name">{productName}</div>
        {productType && <div className="kr-food-type">식품유형: {productType}</div>}
        {totalContent && totalUnit && <div className="kr-content">내용량: {totalContent}{totalUnit}</div>}
      </div>

      {/* 원재료명 */}
      <div className="kr-section">
        <div className="kr-section-title">원재료명</div>
        <div className="kr-ingredients-text">
          {sorted.map(i => {
            let t = i.name;
            if (i.origin) t += `(${i.origin})`;
            if (parseFloat(i.ratio) > 0) t += ` ${i.ratio}%`;
            return t;
          }).join(', ')}
        </div>
      </div>

      {/* 영양정보 */}
      <div className="kr-nutrition-box">
        <div className="kr-nut-header">
          <span className="kr-nut-title">영양정보</span>
          <span className="kr-nut-dv">1일 영양성분 기준치에 대한 비율(%)</span>
        </div>
        <div className="kr-nut-serving">
          {servingSize && servingUnit ? `1회 제공량 ${servingSize}${servingUnit}` : ''}
          {totalContent && totalUnit ? ` / 총 내용량 ${totalContent}${totalUnit}` : ''}
        </div>

        {/* 열량 */}
        <div className="kr-calories-row">
          <span className="kr-cal-value">{ni.calories || 0}kcal</span>
        </div>

        {/* 영양성분 바 차트 */}
        <div className="kr-nutrients">
          {nutrientRows.map(({ key, label, unit, dv, indent }) => {
            const val = ni[key] ?? 0;
            const dvPct = dv > 0 ? pctNum(val, dv) : -1;
            return (
              <div key={key} className={`kr-nut-row ${indent ? 'indent' : ''}`}>
                <div className="kr-nut-label">{label.trim()}</div>
                <div className="kr-nut-val">{fmt(val, unit)}</div>
                <div className="kr-nut-bar-wrap">
                  {dvPct >= 0 && (
                    <div className="kr-nut-bar">
                      <div
                        className="kr-nut-bar-fill"
                        style={{ width: `${Math.min(dvPct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="kr-nut-pct">{dvPct >= 0 ? `${dvPct}%` : ''}</div>
              </div>
            );
          })}
        </div>

        <div className="kr-nut-footer">
          * %영양성분기준치: 1일 영양성분기준치에 대한 비율
        </div>
      </div>

      {/* 알레르기 유발물질 */}
      {allergenList.length > 0 && (
        <div className="kr-allergen">
          <strong>알레르기 유발물질:</strong> {allergenList.join(', ')} 함유
        </div>
      )}

      {/* 보관방법 */}
      <div className="kr-section">
        <div className="kr-section-title">보관방법</div>
        <div className="kr-section-text">{storage}</div>
      </div>

      {/* 주의사항 */}
      {precautions.length > 0 && (
        <div className="kr-section">
          <div className="kr-section-title">주의사항</div>
          <ul className="kr-precautions">
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
