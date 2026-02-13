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
    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.productName = { contains: search, mode: 'insensitive' };
    }
    if (status) {
      where.status = status;
    }

    const [labels, total] = await Promise.all([
      prisma.label.findMany({
        where,
        include: LABEL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.label.count({ where }),
    ]);

    res.json({
      labels,
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
        servingSize: servingSize ? parseFloat(servingSize) : null,
        servingUnit,
        totalContent: totalContent ? parseFloat(totalContent) : null,
        totalUnit,
        healthClaims: healthClaims || null,
        aiNotes: aiNotes || null,
        labelSnapshot: labelSnapshot || null,
        createdById: req.user.id,
        nutritionInfo: nutritionInfo
          ? {
              create: {
                calories: nutritionInfo.calories ? parseFloat(nutritionInfo.calories) : null,
                carbohydrates: nutritionInfo.carbohydrates ? parseFloat(nutritionInfo.carbohydrates) : null,
                sugars: nutritionInfo.sugars ? parseFloat(nutritionInfo.sugars) : null,
                dietaryFiber: nutritionInfo.dietaryFiber ? parseFloat(nutritionInfo.dietaryFiber) : null,
                protein: nutritionInfo.protein ? parseFloat(nutritionInfo.protein) : null,
                totalFat: nutritionInfo.totalFat ? parseFloat(nutritionInfo.totalFat) : null,
                saturatedFat: nutritionInfo.saturatedFat ? parseFloat(nutritionInfo.saturatedFat) : null,
                transFat: nutritionInfo.transFat ? parseFloat(nutritionInfo.transFat) : null,
                cholesterol: nutritionInfo.cholesterol ? parseFloat(nutritionInfo.cholesterol) : null,
                sodium: nutritionInfo.sodium ? parseFloat(nutritionInfo.sodium) : null,
                vitaminA: nutritionInfo.vitaminA ? parseFloat(nutritionInfo.vitaminA) : null,
                vitaminC: nutritionInfo.vitaminC ? parseFloat(nutritionInfo.vitaminC) : null,
                calcium: nutritionInfo.calcium ? parseFloat(nutritionInfo.calcium) : null,
                iron: nutritionInfo.iron ? parseFloat(nutritionInfo.iron) : null,
              },
            }
          : undefined,
        ingredients: ingredients?.length
          ? {
              create: ingredients.map((ing, idx) => ({
                name: ing.name,
                ratio: parseFloat(ing.ratio),
                origin: ing.origin || null,
                allergen: ing.allergen || false,
                allergenInfo: ing.allergenInfo || null,
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

    if (nutritionInfo) {
      await prisma.nutritionInfo.upsert({
        where: { labelId: req.params.id },
        create: {
          labelId: req.params.id,
          ...Object.fromEntries(
            Object.entries(nutritionInfo).map(([k, v]) => [k, v ? parseFloat(v) : null])
          ),
        },
        update: Object.fromEntries(
          Object.entries(nutritionInfo).map(([k, v]) => [k, v ? parseFloat(v) : null])
        ),
      });
    }

    if (ingredients) {
      await prisma.ingredient.deleteMany({ where: { labelId: req.params.id } });
      await prisma.ingredient.createMany({
        data: ingredients.map((ing, idx) => ({
          labelId: req.params.id,
          name: ing.name,
          ratio: parseFloat(ing.ratio),
          origin: ing.origin || null,
          allergen: ing.allergen || false,
          allergenInfo: ing.allergenInfo || null,
          sortOrder: idx,
        })),
      });
    }

    const label = await prisma.label.update({
      where: { id: req.params.id },
      data: {
        ...(productName && { productName }),
        ...(productType !== undefined && { productType: productType || null }),
        ...(salesChannel !== undefined && { salesChannel }),
        ...(servingSize !== undefined && { servingSize: servingSize ? parseFloat(servingSize) : null }),
        ...(servingUnit !== undefined && { servingUnit }),
        ...(totalContent !== undefined && { totalContent: totalContent ? parseFloat(totalContent) : null }),
        ...(totalUnit !== undefined && { totalUnit }),
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
