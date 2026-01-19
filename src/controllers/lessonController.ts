import { Request, Response } from "express";
import mongoose from "mongoose";
import { ILesson, Lesson, ResourceType } from "../models/Lesson";
import { Module } from "../models/Module";
import { Progress } from "../models/ProgressTrack";
import { QueryHelper } from "../utils/queryHelper";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

// ======================================================
// CREATE LESSON
// ======================================================
export const createLesson = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      moduleId,
      dayNumber,
      title,
      description,
      type,
      duration,
      content,
      learningObjectives,
      scheduledDate,
      order,
    } = req.body;

    if (!req.user)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const moduleExists = await Module.findById(moduleId);
    if (!moduleExists)
      return res.status(404).json({ success: false, error: "Module not found" });

    // Instructor can only add lessons to their own course
    if (req.user.role === "instructor") {
      const courseId = moduleExists.courseId.toString();
      if (courseId && courseId !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ success: false, error: "Cannot add lessons to this module" });
      }
    }

    // Handle uploaded files
    const resources: { video?: string[]; documents?: string[]; others?: string[] } =
      {};
    const files = req.files as {
      [fieldname: string]: Express.Multer.File[];
    };

    if (files) {
      if (files.video) resources.video = files.video.map((f) => f.path);
      if (files.documents) resources.documents = files.documents.map((f) => f.path);
      if (files.resources) resources.others = files.resources.map((f) => f.path);
      if (files.coverImage) resources.others = [...(resources.others || []), files.coverImage[0].path];
    }

    const lesson = await Lesson.create({
      moduleId,
      dayNumber,
      title,
      description,
      type,
      duration,
      content,
      learningObjectives,
      resources,
      scheduledDate,
      order,
      isPublished: false, // Requires admin approval
    });

    return res.status(201).json({
      success: true,
      message: "Lesson created, pending publication",
      data: lesson,
    });
  }
);

// ======================================================
// GET ALL LESSONS (ADMIN)
// ======================================================
export const getAllLessonsAdmin = asyncHandler(async (req: Request, res: Response) => {
  let query = Lesson.find().populate("moduleId", "title");
  const queryHelper = new QueryHelper(query, req.query);

  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;
  const lessons = await query;

  res.status(200).json({
    success: true,
    count: lessons.length,
    data: lessons,
  });
});

// ======================================================
// GET PUBLISHED LESSONS (STUDENTS)
// ======================================================
export const getPublishedLessons = asyncHandler(async (req: Request, res: Response) => {
  let query = Lesson.find({ isPublished: true });
  const queryHelper = new QueryHelper(query, req.query);

  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;
  const lessons = await query;

  res.status(200).json({
    success: true,
    count: lessons.length,
    data: lessons,
  });
});

// ======================================================
// GET LESSON BY ID
// ======================================================
export const getLessonById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id).populate("moduleId", "title");

  if (!lesson || (!lesson.isPublished && req.user?.role !== "admin" && req.user?.role !== "instructor")) {
    return res.status(404).json({ success: false, error: "Lesson not found" });
  }

 return res.status(200).json({ success: true, data: lesson });
});

// ======================================================
// UPDATE LESSON
// ======================================================
export const updateLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

  // Instructor can only update own lesson
  if (req.user?.role === "instructor") {
    const module = await Module.findById(lesson.moduleId);
    if (!module) return res.status(404).json({ success: false, error: "Module not found" });
    if (module.courseId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: "Cannot update this lesson" });
    }
    lesson.isPublished = false; // Revert to unpublished
  }

// Handle uploaded files properly
const files = req.files as { [fieldname: string]: Express.Multer.File[] };
if (files) {
  const resources: ILesson["resources"] = { video: [], documents: [], others: [] };

  // Videos
  if (files.video) {
    resources.video = files.video.map((f) => ({
      title: f.originalname,
      type: ResourceType.VIDEO,
      url: f.path,
      size: f.size,
      duration: undefined, // Optional: you can extract video duration if needed
    }));
  }

  // Documents
  if (files.documents) {
    resources.documents = files.documents.map((f) => ({
      title: f.originalname,
      type: ResourceType.PDF,
      url: f.path,
      size: f.size,
    }));
  }

  // Other resources (generic)
  if (files.resources) {
    resources.others = files.resources.map((f) => ({
      title: f.originalname,
      type: ResourceType.OTHER,
      url: f.path,
      size: f.size,
    }));
  }

  // Cover image as "other" resource
  if (files.coverImage && files.coverImage.length > 0) {
    if (!resources.others) resources.others = [];
    resources.others.push({
      title: files.coverImage[0].originalname,
      type: ResourceType.OTHER,
      url: files.coverImage[0].path,
      size: files.coverImage[0].size,
    });
  }

  lesson.resources = resources;
}


  Object.assign(lesson, req.body);
  await lesson.save();

 return res.json({ success: true, message: "Lesson updated", data: lesson });
});

// ======================================================
// DELETE LESSON
// ======================================================
export const deleteLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findByIdAndDelete(req.params.id);
  if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

 return res.status(200).json({ success: true, message: "Lesson deleted" });
});

// ======================================================
// TOGGLE LESSON PUBLISH
// ======================================================
export const toggleLessonPublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

  lesson.isPublished = !lesson.isPublished;
  await lesson.save();

 return res.json({
    success: true,
    message: `Lesson ${lesson.isPublished ? "published" : "unpublished"} successfully`,
    data: lesson,
  });
});

// ======================================================
// GET LESSONS BY MODULE (PUBLIC)
// ======================================================
export const getLessonsByModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { moduleId } = req.params;
  const { page = "1", limit = "10" } = req.query;

  const moduleExists = await Module.findById(moduleId);
  if (!moduleExists) return res.status(404).json({ success: false, error: "Module not found" });

  let query = Lesson.find({ moduleId, isPublished: true });
  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.sort().paginate().query;

  const total = await Lesson.countDocuments({ moduleId, isPublished: true });
  const lessons = await query;

 return res.status(200).json({
    success: true,
    count: lessons.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: lessons,
  });
});

// ======================================================
// REORDER LESSONS
// ======================================================
export const reorderLessons = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orders } = req.body; // [{ lessonId, order }]
  const bulkOps = orders.map((item: any) => ({
    updateOne: { filter: { _id: item.lessonId }, update: { order: item.order } },
  }));

  await Lesson.bulkWrite(bulkOps);

  res.status(200).json({ success: true, message: "Lessons reordered successfully" });
});

// ======================================================
// LESSON STATS
// ======================================================
export const lessonStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await Lesson.aggregate([
    {
      $group: {
        _id: "$type",
        total: { $sum: 1 },
        published: { $sum: { $cond: ["$isPublished", 1, 0] } },
      },
    },
  ]);

  res.status(200).json({ success: true, data: stats });
});

export const startLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user)
    return res.status(401).json({ success: false, error: "Unauthorized" });

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson || !lesson.isPublished)
    return res.status(404).json({ success: false, error: "Lesson not found" });

  // Find the parent module to get courseId for progress
  const module = await Module.findById(lesson.moduleId);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  const courseId = module.courseId;

  // Find or create student progress for this course
  let progress = await Progress.findOne({ studentId: req.user._id, courseId });

  if (!progress) {
    progress = await Progress.create({
      studentId: req.user._id,
      courseId,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons: 0,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
      lastAccessedAt: new Date(),
      enrolledAt: new Date(),
    });
  }

  // Find or create module progress
  let moduleProgress = progress.modules.find(
    (m) => m.moduleId.toString() === lesson.moduleId.toString()
  );

  if (!moduleProgress) {
    moduleProgress = {
      moduleId: lesson.moduleId,
      lessons: [],
      assessments: [], // required for TypeScript
      completionPercentage: 0,
      startedAt: new Date(),
    };
    progress.modules.push(moduleProgress);
  }

  // Find or create lesson progress
  let lessonProgress = moduleProgress.lessons.find(
    (l) => l.lessonId.toString() === lesson._id.toString()
  );

  if (!lessonProgress) {
    lessonProgress = {
      lessonId: lesson._id,
      status: "in_progress",
      startedAt: new Date(),
      timeSpent: 0,
    };
    moduleProgress.lessons.push(lessonProgress);
  } else if (lessonProgress.status === "not_started") {
    lessonProgress.status = "in_progress";
    lessonProgress.startedAt = new Date();
  }

  // Update last accessed date
  progress.lastAccessedAt = new Date();

  await progress.save();

 return res.status(200).json({
    success: true,
    message: "Lesson started",
    data: progress,
  });
});


// ======================================================
// MARK LESSON COMPLETE
// ======================================================
export const completeLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson || !lesson.isPublished)
    return res.status(404).json({ success: false, error: "Lesson not found" });

  // Find the parent module to get courseId for progress
  const module = await Module.findById(lesson.moduleId);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  const courseId = module.courseId;

  // Find or create student progress for this course
  let progress = await Progress.findOne({ studentId: req.user._id, courseId });

  if (!progress) {
    progress = await Progress.create({
      studentId: req.user._id,
      courseId,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons: 0,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
      lastAccessedAt: new Date(),
      enrolledAt: new Date(),
    });
  }

  // Find or create module progress
  let moduleProgress = progress.modules.find(
    (m) => m.moduleId.toString() === lesson.moduleId.toString()
  );

  if (!moduleProgress) {
    moduleProgress = {
      moduleId: lesson.moduleId,
      lessons: [],
      assessments: [], // <--- REQUIRED
      completionPercentage: 0,
      startedAt: new Date(),
    };
    progress.modules.push(moduleProgress);
  }

  // Check if lesson already exists in module progress
  let lessonProgress = moduleProgress.lessons.find(
    (l) => l.lessonId.toString() === lesson._id.toString()
  );

  if (!lessonProgress) {
    lessonProgress = {
      lessonId: lesson._id,
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      timeSpent: 0, // Optional: calculate from startedAt
    };
    moduleProgress.lessons.push(lessonProgress);
  } else if (lessonProgress.status !== "completed") {
    lessonProgress.status = "completed";
    lessonProgress.completedAt = new Date();
  }

  // Update module completion percentage
  const totalLessons = await Lesson.countDocuments({ moduleId: lesson.moduleId });
  moduleProgress.completionPercentage = Math.round(
    (moduleProgress.lessons.filter((l) => l.status === "completed").length / totalLessons) * 100
  );

  // Update overall progress for the course
  const allLessonsCount = await Lesson.countDocuments({
    moduleId: { $in: progress.modules.map((m) => m.moduleId) },
  });

  const completedLessonsCount = progress.modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => l.status === "completed").length,
    0
  );

  progress.overallProgress =
    allLessonsCount > 0 ? Math.round((completedLessonsCount / allLessonsCount) * 100) : 0;
  progress.completedLessons = completedLessonsCount;
  progress.totalLessons = allLessonsCount;
  progress.lastAccessedAt = new Date();

  await progress.save();

 return res.json({ success: true, message: "Lesson completed", data: progress });
});

// Get Course Progress
export const getCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user)
    return res.status(401).json({ success: false, error: "Unauthorized" });

  const progress = await Progress.findOne({ studentId: req.user._id, courseId: req.params.courseId });
  if (!progress) return res.status(404).json({ success: false, error: "Progress not found" });

  // Recalculate total lessons and completed lessons dynamically
  let totalLessons = 0;
  let completedLessons = 0;

  for (const moduleProgress of progress.modules) {
    const lessonsInModule = await Lesson.countDocuments({ moduleId: moduleProgress.moduleId });
    totalLessons += lessonsInModule;
    completedLessons += moduleProgress.lessons.filter(l => l.status === 'completed').length;
  }

  // Recalculate overall progress
  progress.totalLessons = totalLessons;
  progress.completedLessons = completedLessons;
  progress.overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  await progress.save();

 return res.status(200).json({
    success: true,
    data: progress,
  });
});
