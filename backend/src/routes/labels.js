const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const DEFAULT_REVIEW_TEMPLATE = [
  {
    name: '법적 필수 표기',
    items: [
      { taskName: '제품명 표기 적정성', department: '품질팀' },
      { taskName: '식품유형 표시', department: '품질팀' },
      { taskName: '원재료명 및 함량 표시', department: '품질팀' },
      { taskName: '영양성분 표시 적정성', department: '품질팀' },
      { taskName: '유통기한/소비기한 표시', department: '품질팀' },
      { taskName: '보관방법 표시', department: '품질팀' },
      { taskName: '알레르기 유발물질 표시', department: '품질팀' },
      { taskName: '제조원/판매원 표시', department: '법무팀' },
      { taskName: '내용량 표시', department: '품질팀' },
    ],
  },
  {
    name: '문안 및 소구',
    items: [
      { taskName: '건강기능 관련 문구 적정성', department: '법무팀' },
      { taskName: '마케팅 문구 적정성', department: '마케팅팀' },
      { taskName: '기능성 표시 문구', department: '연구팀' },
      { taskName: '주의사항 문구', department: '품질팀' },
    ],
  },
  {
    name: '디자인/바코드',
    items: [
      { taskName: '디자인 시안 확인', department: '디자인팀' },
      { taskName: '바코드 규격 확인', department: '디자인팀' },
      { taskName: '글자 크기 적정성', department: '디자인팀' },
      { taskName: '색상 및 레이아웃', department: '디자인팀' },
    ],
  },
  {
    name: '최종 확인',
    items: [
      { taskName: '전체 항목 교차 검증', department: '품질팀' },
      { taskName: '오탈자 확인', department: '품질팀' },
      { taskName: '인쇄 사양 확인', department: '생산팀' },
    ],
  },
  {
    name: '최종 승인',
    items: [
      { taskName: '팀장 승인', department: '품질팀' },
      { taskName: '부서장 최종 승인', department: '경영팀' },
    ],
  },
];

// 안전한 숫자 파싱 (0도 유효한 값으로 처리, 빈 문자열/null/undefined만 null)
function safeParseFloat(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

const LABEL_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, department: true } },
  nutritionInfo: true,
  ingredients: { orderBy: { sortOrder: 'asc' } },
  reviewCategories: {
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { reviewer: { select: { id: true, name: true, department: true } } },
      },
    },
  },
};

// 라벨 목록 조회
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, completion } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 검토 완성도 필터와 무관한 공통 조건(검색·상태)만 담는다 — 완성도 건수 집계에 재사용
    const baseWhere = {};
    if (search) {
      baseWhere.productName = { contains: search, mode: 'insensitive' };
    }
    if (status) {
      baseWhere.status = status;
    }

    // 검토 체크리스트 완성도로 구분 — status(초안/검토중/승인)와는 별개 축이다.
    // done: 미완료 항목이 하나도 없고 항목이 최소 1개 있는 것(빈 체크리스트를 완료로 세지 않음)
    // in_progress: 미완료 항목이 하나라도 있는 것
    const DONE_WHERE = {
      AND: [
        { reviewCategories: { some: { items: { some: {} } } } },
        { NOT: { reviewCategories: { some: { items: { some: { isCompleted: false } } } } } },
      ],
    };
    const IN_PROGRESS_WHERE = {
      reviewCategories: { some: { items: { some: { isCompleted: false } } } },
    };

    const where = { ...baseWhere };
    if (completion === 'done') Object.assign(where, DONE_WHERE);
    else if (completion === 'in_progress') Object.assign(where, IN_PROGRESS_WHERE);

    const [labels, total, doneCount, inProgressCount] = await Promise.all([
      prisma.label.findMany({
        where,
        include: LABEL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.label.count({ where }),
      prisma.label.count({ where: { AND: [baseWhere, DONE_WHERE] } }),
      prisma.label.count({ where: { AND: [baseWhere, IN_PROGRESS_WHERE] } }),
    ]);

    res.json({
      labels,
      completionCounts: { done: doneCount, in_progress: inProgressCount },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get labels error:', error);
    res.status(500).json({ error: '목록 조회에 실패했습니다.' });
  }
});

// 라벨 상세 조회
router.get('/:id', authenticate, async (req, res) => {
  try {
    const label = await prisma.label.findUnique({
      where: { id: req.params.id },
      include: LABEL_INCLUDE,
    });

    if (!label) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    res.json({ label });
  } catch (error) {
    console.error('Get label error:', error);
    res.status(500).json({ error: '라벨 조회에 실패했습니다.' });
  }
});

// 라벨 생성
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      productName,
      productType,
      salesChannel,
      servingSize,
      servingUnit,
      totalContent,
      totalUnit,
      shelfLife,
      storageMethod,
      crossContaminationAllergens,
      nutritionInfo,
      ingredients,
      healthClaims,
      aiNotes,
      labelSnapshot,
    } = req.body;

    if (!productName) {
      return res.status(400).json({ error: '제품명을 입력해주세요.' });
    }

    const label = await prisma.label.create({
      data: {
        productName,
        productType: productType || null,
        salesChannel,
        servingSize: safeParseFloat(servingSize),
        servingUnit,
        totalContent: safeParseFloat(totalContent),
        totalUnit,
        shelfLife: shelfLife || null,
        storageMethod: storageMethod || null,
        crossContaminationAllergens: crossContaminationAllergens || null,
        healthClaims: healthClaims || null,
        aiNotes: aiNotes || null,
        labelSnapshot: labelSnapshot || null,
        createdById: req.user.id,
        nutritionInfo: nutritionInfo
          ? {
              create: {
                calories: safeParseFloat(nutritionInfo.calories),
                carbohydrates: safeParseFloat(nutritionInfo.carbohydrates),
                sugars: safeParseFloat(nutritionInfo.sugars),
                dietaryFiber: safeParseFloat(nutritionInfo.dietaryFiber),
                protein: safeParseFloat(nutritionInfo.protein),
                totalFat: safeParseFloat(nutritionInfo.totalFat),
                saturatedFat: safeParseFloat(nutritionInfo.saturatedFat),
                transFat: safeParseFloat(nutritionInfo.transFat),
                cholesterol: safeParseFloat(nutritionInfo.cholesterol),
                sodium: safeParseFloat(nutritionInfo.sodium),
                vitaminA: safeParseFloat(nutritionInfo.vitaminA),
                vitaminC: safeParseFloat(nutritionInfo.vitaminC),
                calcium: safeParseFloat(nutritionInfo.calcium),
                iron: safeParseFloat(nutritionInfo.iron),
              },
            }
          : undefined,
        ingredients: ingredients?.length
          ? {
              create: ingredients.map((ing, idx) => ({
                name: ing.name,
                ratio: safeParseFloat(ing.ratio) ?? 0,
                origin: ing.origin || null,
                allergen: ing.allergen || false,
                allergenInfo: ing.allergenInfo || null,
                ingredientType: ing.ingredientType || 'regular',
                subIngredients: ing.subIngredients || null,
                additivePurpose: ing.additivePurpose || null,
                sortOrder: idx,
              })),
            }
          : undefined,
        reviewCategories: {
          create: DEFAULT_REVIEW_TEMPLATE.map((cat, catIdx) => ({
            name: cat.name,
            sortOrder: catIdx,
            items: {
              create: cat.items.map((item, itemIdx) => ({
                taskName: item.taskName,
                department: item.department,
                sortOrder: itemIdx,
              })),
            },
          })),
        },
      },
      include: LABEL_INCLUDE,
    });

    res.status(201).json({ label });
  } catch (error) {
    console.error('Create label error:', error);
    res.status(500).json({ error: '라벨 생성에 실패했습니다.' });
  }
});

// 라벨 수정
router.put('/:id', authenticate, async (req, res) => {
  try {
    const {
      productName,
      productType,
      salesChannel,
      servingSize,
      servingUnit,
      totalContent,
      totalUnit,
      shelfLife,
      storageMethod,
      crossContaminationAllergens,
      status,
      nutritionInfo,
      ingredients,
      healthClaims,
      aiNotes,
      labelSnapshot,
    } = req.body;

    const existing = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    // 영양성분: 전달된 필드만 업데이트 (0 값도 보존)
    if (nutritionInfo) {
      const nutrientFields = [
        'calories', 'carbohydrates', 'sugars', 'dietaryFiber', 'protein',
        'totalFat', 'saturatedFat', 'transFat', 'cholesterol', 'sodium',
        'vitaminA', 'vitaminC', 'calcium', 'iron',
      ];
      const parsed = {};
      for (const key of nutrientFields) {
        if (key in nutritionInfo) {
          parsed[key] = safeParseFloat(nutritionInfo[key]);
        }
      }
      await prisma.nutritionInfo.upsert({
        where: { labelId: req.params.id },
        create: { labelId: req.params.id, ...parsed },
        update: parsed,
      });
    }

    // 원재료: 전달된 경우에만 교체
    if (ingredients) {
      await prisma.ingredient.deleteMany({ where: { labelId: req.params.id } });
      await prisma.ingredient.createMany({
        data: ingredients.map((ing, idx) => ({
          labelId: req.params.id,
          name: ing.name,
          ratio: safeParseFloat(ing.ratio) ?? 0,
          origin: ing.origin || null,
          allergen: ing.allergen || false,
          allergenInfo: ing.allergenInfo || null,
          ingredientType: ing.ingredientType || 'regular',
          subIngredients: ing.subIngredients || null,
          additivePurpose: ing.additivePurpose || null,
          sortOrder: idx,
        })),
      });
    }

    // 라벨 기본 정보: 전달된 필드만 업데이트 (undefined인 필드는 기존값 유지)
    const label = await prisma.label.update({
      where: { id: req.params.id },
      data: {
        ...(productName && { productName }),
        ...(productType !== undefined && { productType: productType || null }),
        ...(salesChannel !== undefined && { salesChannel }),
        ...(servingSize !== undefined && { servingSize: safeParseFloat(servingSize) }),
        ...(servingUnit !== undefined && { servingUnit }),
        ...(totalContent !== undefined && { totalContent: safeParseFloat(totalContent) }),
        ...(totalUnit !== undefined && { totalUnit }),
        ...(shelfLife !== undefined && { shelfLife: shelfLife || null }),
        ...(storageMethod !== undefined && { storageMethod: storageMethod || null }),
        ...(crossContaminationAllergens !== undefined && { crossContaminationAllergens: crossContaminationAllergens || null }),
        ...(status && { status }),
        ...(healthClaims !== undefined && { healthClaims }),
        ...(aiNotes !== undefined && { aiNotes }),
        ...(labelSnapshot !== undefined && { labelSnapshot }),
      },
      include: LABEL_INCLUDE,
    });

    res.json({ label });
  } catch (error) {
    console.error('Update label error:', error);
    res.status(500).json({ error: '라벨 수정에 실패했습니다.' });
  }
});

// 라벨 삭제
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    await prisma.label.delete({ where: { id: req.params.id } });
    res.json({ message: '라벨이 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete label error:', error);
    res.status(500).json({ error: '라벨 삭제에 실패했습니다.' });
  }
});

module.exports = router;
