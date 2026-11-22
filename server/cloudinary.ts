import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
]);

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim()
  );
}

export function configureCloudinary() {
  if (!isCloudinaryConfigured()) return false;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    api_key: process.env.CLOUDINARY_API_KEY!.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET!.trim(),
    secure: true,
  });
  return true;
}

export const imageUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 6,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG, WEBP hoặc AVIF.'));
      return;
    }
    cb(null, true);
  },
});

export function uploadBufferToCloudinary(
  buffer: Buffer,
  folder = 'moc-men/crafts'
): Promise<{ url: string; publicId: string }> {
  if (!configureCloudinary()) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED');
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Upload lên Cloudinary thất bại.'));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    stream.end(buffer);
  });
}
