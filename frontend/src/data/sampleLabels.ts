export interface SampleTemplate {
  id: string;
  name: string;
  emoji: string;
  productType: string;
  servingSize: string;
  servingUnit: string;
  totalContent: string;
  totalUnit: string;
  ingredients: Array<{
    name: string;
    ratio: string;
    origin: string;
    allergen: boolean;
    allergenInfo: string;
  }>;
  nutrition: Record<string, string>;
}

export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    id: 'choco-cookie',
    name: '초코칩 쿠키',
    emoji: '🍪',
    productType: '과자',
    servingSize: '30',
    servingUnit: 'g',
    totalContent: '150',
    totalUnit: 'g',
    ingredients: [
      { name: '밀가루', ratio: '35', origin: '미국산', allergen: true, allergenInfo: '밀' },
      { name: '버터', ratio: '20', origin: '국산', allergen: true, allergenInfo: '우유' },
      { name: '설탕', ratio: '18', origin: '', allergen: false, allergenInfo: '' },
      { name: '초콜릿칩', ratio: '12', origin: '벨기에산', allergen: true, allergenInfo: '우유, 대두' },
      { name: '계란', ratio: '8', origin: '국산', allergen: true, allergenInfo: '난류' },
      { name: '베이킹파우더', ratio: '2', origin: '', allergen: false, allergenInfo: '' },
      { name: '바닐라향', ratio: '1', origin: '', allergen: false, allergenInfo: '' },
      { name: '소금', ratio: '0.5', origin: '국산', allergen: false, allergenInfo: '' },
    ],
    nutrition: {
      calories: '142', carbohydrates: '18', sugars: '10', dietaryFiber: '0.8',
      protein: '2', totalFat: '7', saturatedFat: '4.2', transFat: '0',
      cholesterol: '15', sodium: '95', vitaminA: '', vitaminC: '', calcium: '12', iron: '0.6',
    },
  },
  {
    id: 'orange-juice',
    name: '오렌지 주스',
    emoji: '🍊',
    productType: '과·채음료',
    servingSize: '200',
    servingUnit: 'ml',
    totalContent: '1000',
    totalUnit: 'ml',
    ingredients: [
      { name: '오렌지농축과즙', ratio: '55', origin: '브라질산', allergen: false, allergenInfo: '' },
      { name: '정제수', ratio: '40', origin: '', allergen: false, allergenInfo: '' },
      { name: '비타민C', ratio: '0.1', origin: '', allergen: false, allergenInfo: '' },
      { name: '구연산', ratio: '0.2', origin: '', allergen: false, allergenInfo: '' },
    ],
    nutrition: {
      calories: '88', carbohydrates: '21', sugars: '18', dietaryFiber: '0.4',
      protein: '1', totalFat: '0', saturatedFat: '0', transFat: '0',
      cholesterol: '0', sodium: '5', vitaminA: '', vitaminC: '60', calcium: '20', iron: '',
    },
  },
  {
    id: 'instant-ramen',
    name: '매운 라면',
    emoji: '🍜',
    productType: '유탕면류',
    servingSize: '120',
    servingUnit: 'g',
    totalContent: '120',
    totalUnit: 'g',
    ingredients: [
      { name: '소맥분(밀가루)', ratio: '52', origin: '미국산', allergen: true, allergenInfo: '밀' },
      { name: '팜유', ratio: '16', origin: '말레이시아산', allergen: false, allergenInfo: '' },
      { name: '전분', ratio: '8', origin: '', allergen: false, allergenInfo: '' },
      { name: '조미분말', ratio: '6', origin: '', allergen: true, allergenInfo: '대두, 밀, 쇠고기' },
      { name: '고춧가루', ratio: '3', origin: '국산', allergen: false, allergenInfo: '' },
      { name: '정제소금', ratio: '2.5', origin: '국산', allergen: false, allergenInfo: '' },
      { name: '건조채소(파, 양파)', ratio: '2', origin: '국산', allergen: false, allergenInfo: '' },
      { name: '마늘분말', ratio: '1', origin: '국산', allergen: false, allergenInfo: '' },
    ],
    nutrition: {
      calories: '500', carbohydrates: '68', sugars: '3', dietaryFiber: '3',
      protein: '10', totalFat: '16', saturatedFat: '8', transFat: '0',
      cholesterol: '0', sodium: '1790', vitaminA: '', vitaminC: '', calcium: '', iron: '3.6',
    },
  },
  {
    id: 'strawberry-yogurt',
    name: '딸기 요거트',
    emoji: '🍓',
    productType: '발효유류',
    servingSize: '150',
    servingUnit: 'g',
    totalContent: '150',
    totalUnit: 'g',
    ingredients: [
      { name: '원유', ratio: '70', origin: '국산', allergen: true, allergenInfo: '우유' },
      { name: '딸기과즙', ratio: '10', origin: '국산', allergen: false, allergenInfo: '' },
      { name: '백설탕', ratio: '8', origin: '', allergen: false, allergenInfo: '' },
      { name: '탈지분유', ratio: '5', origin: '뉴질랜드산', allergen: true, allergenInfo: '우유' },
      { name: '유산균배양액', ratio: '3', origin: '', allergen: false, allergenInfo: '' },
      { name: '펙틴', ratio: '0.5', origin: '', allergen: false, allergenInfo: '' },
      { name: '딸기향', ratio: '0.3', origin: '', allergen: false, allergenInfo: '' },
    ],
    nutrition: {
      calories: '130', carbohydrates: '20', sugars: '17', dietaryFiber: '0.3',
      protein: '5', totalFat: '3', saturatedFat: '2', transFat: '0',
      cholesterol: '10', sodium: '60', vitaminA: '30', vitaminC: '4', calcium: '170', iron: '',
    },
  },
  {
    id: 'vitamin-supplement',
    name: '비타민C 1000',
    emoji: '💊',
    productType: '건강기능식품',
    servingSize: '1',
    servingUnit: '정',
    totalContent: '60',
    totalUnit: '정',
    ingredients: [
      { name: 'L-아스코르브산(비타민C)', ratio: '50', origin: '영국산', allergen: false, allergenInfo: '' },
      { name: '결정셀룰로스', ratio: '20', origin: '', allergen: false, allergenInfo: '' },
      { name: '히드록시프로필메틸셀룰로스', ratio: '10', origin: '', allergen: false, allergenInfo: '' },
      { name: '스테아르산마그네슘', ratio: '5', origin: '', allergen: false, allergenInfo: '' },
      { name: '이산화규소', ratio: '3', origin: '', allergen: false, allergenInfo: '' },
    ],
    nutrition: {
      calories: '4', carbohydrates: '1', sugars: '0', dietaryFiber: '0',
      protein: '0', totalFat: '0', saturatedFat: '0', transFat: '0',
      cholesterol: '0', sodium: '0', vitaminA: '', vitaminC: '1000', calcium: '', iron: '',
    },
  },
];
