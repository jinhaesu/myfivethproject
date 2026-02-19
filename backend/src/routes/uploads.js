const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// uploads 디렉토리 생성
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'designs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// multer 설정 - PDF/이미지 파일만 허용
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `design-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('PDF 또는 이미지 파일(PNG, JPG, WebP)만 업로드 가능합니다.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// 디자인 파일 업로드
router.post('/:labelId/design', authenticate, upload.single('designFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일을 선택해주세요.' });
    }

    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      // 업로드된 파일 삭제
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    // 기존 파일 삭제
    if (label.designFileUrl) {
      const oldPath = path.join(__dirname, '..', '..', label.designFileUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const fileUrl = `/uploads/designs/${req.file.filename}`;

    const updated = await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        designFileUrl: fileUrl,
        designFileName: req.file.originalname,
        designUploadedAt: new Date(),
      },
    });

    res.json({
      designFileUrl: updated.designFileUrl,
      designFileName: updated.designFileName,
      designUploadedAt: updated.designUploadedAt,
    });
  } catch (error) {
    console.error('Design file upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: '파일 업로드에 실패했습니다.' });
  }
});

// 디자인 파일 조회 (express.static 폴백)
router.get('/designs/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // path traversal 방지
  const filePath = path.join(uploadDir, filename);

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }

  res.sendFile(filePath);
});

// 디자인 파일 삭제
router.delete('/:labelId/design', authenticate, async (req, res) => {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    if (label.designFileUrl) {
      const filePath = path.join(__dirname, '..', '..', label.designFileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.label.update({
      where: { id: req.params.labelId },
      data: {
        designFileUrl: null,
        designFileName: null,
        designUploadedAt: null,
      },
    });

    res.json({ message: '디자인 파일이 삭제되었습니다.' });
  } catch (error) {
    console.error('Design file delete error:', error);
    res.status(500).json({ error: '파일 삭제에 실패했습니다.' });
  }
});

module.exports = router;
