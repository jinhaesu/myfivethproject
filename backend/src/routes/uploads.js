const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const storage = require('../lib/storage');

const router = express.Router();
const prisma = new PrismaClient();

// 로컬 임시 uploads 디렉토리 생성 (multer 임시 저장용)
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'designs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// multer 설정 - PDF/이미지 파일만 허용
const multerStorage = multer.diskStorage({
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
  storage: multerStorage,
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
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    // 기존 파일 삭제 (S3 또는 로컬)
    if (label.designFileUrl) {
      const oldKey = label.designFileUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(oldKey); } catch (e) { console.error('Failed to delete old file:', e); }
    }

    const s3Key = `designs/${req.file.filename}`;
    const fileUrl = `/uploads/designs/${req.file.filename}`;

    // S3에 업로드 (S3 미설정 시 로컬 유지)
    await storage.uploadFile(s3Key, req.file.path, req.file.mimetype);

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

// 디자인 파일 조회 (S3 또는 로컬 스트리밍)
router.get('/designs/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename); // path traversal 방지
  const key = `designs/${filename}`;

  try {
    const result = await storage.getFileStream(key);
    if (!result) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    res.setHeader('Content-Type', result.contentType);
    if (result.contentLength) {
      res.setHeader('Content-Length', result.contentLength);
    }
    result.stream.pipe(res);
  } catch (error) {
    console.error('File serving error:', error);
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
});

// HEAD 요청 지원 (프론트엔드 파일 존재 확인용)
router.head('/designs/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const key = `designs/${filename}`;

  try {
    const exists = await storage.fileExists(key);
    if (!exists) {
      return res.status(404).end();
    }
    res.status(200).end();
  } catch {
    return res.status(404).end();
  }
});

// 디자인 파일 삭제
router.delete('/:labelId/design', authenticate, async (req, res) => {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) {
      return res.status(404).json({ error: '라벨을 찾을 수 없습니다.' });
    }

    if (label.designFileUrl) {
      const key = label.designFileUrl.replace(/^\/uploads\//, '');
      try { await storage.deleteFile(key); } catch (e) { console.error('Failed to delete file:', e); }
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
