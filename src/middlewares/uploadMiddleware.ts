import { Request } from "express";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/claudinary";

// ============================================
// Cloudinary Storage Configuration
// ============================================

// Storage for images
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: Request, file: Express.Multer.File) => ({
    folder: "ai-accelerator/images",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 1920, height: 1080, crop: "limit" }, { quality: "auto" }],
    public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

// Storage for documents
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: Request, file: Express.Multer.File) => ({
    folder: "ai-accelerator/documents",
    allowed_formats: ["pdf", "doc", "docx", "ppt", "pptx", "txt"],
    resource_type: "raw" as const,
    public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

// Storage for videos
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: Request, file: Express.Multer.File) => ({
    folder: "ai-accelerator/videos",
    allowed_formats: ["mp4", "avi", "mov", "wmv", "webm"],
    resource_type: "video" as const,
    public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

// General storage (all types)
const generalStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: Request, file: Express.Multer.File) => {
    const ext = path.extname(file.originalname).toLowerCase();
    let folder = "ai-accelerator/others";
    let resourceType: "image" | "video" | "raw" | "auto" = "auto";

    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      folder = "ai-accelerator/images";
      resourceType = "image";
    } else if ([".mp4", ".avi", ".mov", ".wmv", ".webm"].includes(ext)) {
      folder = "ai-accelerator/videos";
      resourceType = "video";
    } else if ([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".zip", ".rar"].includes(ext)) {
      folder = "ai-accelerator/documents";
      resourceType = "raw";
    }

    return { folder, resource_type: resourceType, public_id: `${Date.now()}-${file.originalname.split(".")[0]}` };
  },
});

// ============================================
// File filters
// ============================================

const checkFileType = (file: Express.Multer.File, regex: RegExp) =>
  regex.test(path.extname(file.originalname).toLowerCase()) || regex.test(file.mimetype);

const imageFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  checkFileType(file, /jpeg|jpg|png|gif|webp/) ? cb(null, true) : cb(new Error("Only images allowed"));
};

const documentFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  checkFileType(file, /pdf|doc|docx|ppt|pptx|txt|zip|rar/) ? cb(null, true) : cb(new Error("Only documents allowed"));
};

const videoFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  checkFileType(file, /mp4|avi|mov|wmv|webm/) ? cb(null, true) : cb(new Error("Only videos allowed"));
};

const generalFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  checkFileType(file, /jpeg|jpg|png|gif|webp|pdf|doc|docx|ppt|pptx|txt|mp4|avi|mov|wmv|webm|zip|rar/)
    ? cb(null, true)
    : cb(new Error("File type not allowed"));
};

// ============================================
// Multer instances
// ============================================

export const uploadImage = multer({ storage: imageStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
export const uploadDocument = multer({ storage: documentStorage, fileFilter: documentFilter, limits: { fileSize: 50 * 1024 * 1024 } });
export const uploadVideo = multer({ storage: videoStorage, fileFilter: videoFilter, limits: { fileSize: 100 * 1024 * 1024 } });
export const uploadGeneral = multer({ storage: generalStorage, fileFilter: generalFilter, limits: { fileSize: 100 * 1024 * 1024 } });

// ============================================
// Export upload configurations
// ============================================

export const uploadMixedFiles = uploadGeneral.fields([
  { name: "coverImage", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "documents", maxCount: 10 },
  { name: "resources", maxCount: 20 },
]);

export const uploadSingleImage = uploadImage.single("image");
export const uploadMultipleImages = uploadImage.array("images", 10);
export const uploadSingleDocument = uploadDocument.single("document");
export const uploadMultipleDocuments = uploadDocument.array("documents", 10);
export const uploadSingleVideo = uploadVideo.single("video");
export const uploadProfilePicture = uploadImage.single("profileImage");
export const uploadCourseCover = uploadImage.single("coverImage");
export const uploadCertificateTemplate = uploadDocument.single("certificateTemplate");
