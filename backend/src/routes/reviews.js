const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 리뷰 항목 업데이트 (체크/해제)
router.put('/items/:itemId', authenticate, async (req, res) => {
  try {
    const { isCompleted, reviewerNote } = req.body;
    const { itemId } = req.params;

    const item = await prisma.reviewItem.findUnique({
      where: { id: itemId },
      include: { category: { include: { label: true } } },
    });

    if (!item) {
      return res.status(404).json({ error: '검토 항목을 찾을 수 없습니다.' });
    }

    const updated = await prisma.reviewItem.update({
      where: { id: itemId },
      data: {
        isCompleted: isCompleted !== undefined ? isCompleted : item.isCompleted,
        reviewerNote: reviewerNote !== undefined ? reviewerNote : item.reviewerNote,
        reviewerId: req.user.id,
        completedAt: isCompleted ? new Date() : null,
      },
      include: {
        reviewer: { select: { id: true, name: true, department: true } },
      },
    });

    // 모든 리뷰가 완료되었는지 확인
    const allItems = await prisma.reviewItem.findMany({
      where: {
        category: { labelId: item.category.labelId },
      },
    });

    const allCompleted = allItems.every((i) => i.id === itemId ? isCompleted : i.isCompleted);

    if (allCompleted) {
      await prisma.label.update({
        where: { id: item.category.labelId },
        data: { status: 'approved' },
      });
    } else {
      const anyCompleted = allItems.some((i) => i.id === itemId ? isCompleted : i.isCompleted);
      if (anyCompleted) {
        await prisma.label.update({
          where: { id: item.category.labelId },
          data: { status: 'in_review' },
        });
      }
    }

    res.json({ item: updated });
  } catch (error) {
    console.error('Update review item error:', error);
    res.status(500).json({ error: '검토 항목 업데이트에 실패했습니다.' });
  }
});

// 라벨의 리뷰 진행률 조회
router.get('/progress/:labelId', authenticate, async (req, res) => {
  try {
    const categories = await prisma.reviewCategory.findMany({
      where: { labelId: req.params.labelId },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            reviewer: { select: { id: true, name: true, department: true } },
          },
        },
      },
    });

    const progress = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      total: cat.items.length,
      completed: cat.items.filter((i) => i.isCompleted).length,
      items: cat.items,
    }));

    const totalItems = progress.reduce((acc, cat) => acc + cat.total, 0);
    const completedItems = progress.reduce((acc, cat) => acc + cat.completed, 0);

    res.json({
      progress,
      summary: {
        total: totalItems,
        completed: completedItems,
        percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Get review progress error:', error);
    res.status(500).json({ error: '검토 진행률 조회에 실패했습니다.' });
  }
});

module.exports = router;
