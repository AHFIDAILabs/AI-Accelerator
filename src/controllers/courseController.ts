// ============================================
// src/controllers/course.controller.ts (ALIGNED)
// ============================================

import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';

import { Course } from '../models/Course';
import { Module } from '../models/Module';
import { Lesson } from '../models/Lesson';
import { Enrollment } from '../models/Enrollment';
import { Progress } from '../models/ProgressTrack';
import { Assessment } from '../models/Assessment';
import { Program } from '../models/program';
import { UserRole } from '../models/user';

import { QueryHelper } from '../utils/queryHelper';
import { CloudinaryHelper } from '../utils/cloudinaryHelper';
import { pushNotification, notifyCourseStudents } from '../utils/pushNotification';
import { NotificationTemplates } from '../utils/notificationTemplates';
import { NotificationType } from '../models/Notification';

// ============================================
// PUBLIC COURSE ENDPOINTS
// ============================================

// @desc    Get all published courses (public)
// @route   GET /api/courses
// @access  Public
export const getAllCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '10', programId } = req.query;

  const filter: any = { isPublished: true };
  if (programId) filter.programId = programId;

  let query = Course.find(filter)
    .populate('createdBy', 'firstName lastName')
    .populate('programId', 'title slug');

  const queryHelper = new QueryHelper(query, req.query);

  query = queryHelper
    .filter()
    .search(['title', 'description', 'targetAudience'])
    .sort()
    .paginate()
    .query;

  const total = await Course.countDocuments(filter);
  const courses = await query;

  res.status(200).json({
    success: true,
    count: courses.length,
    total,
    page: parseInt(page as string, 10),
    pages: Math.ceil(total / parseInt(limit as string, 10)),
    data: courses,
  });
});

// @desc    Get single course by ID or SLUG (public)
// @route   GET /api/courses/:id
// @access  Public
export const getCourseById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const identifier = req.params.id;

  // Try slug first, then _id
  let course = await Course.findOne({ slug: identifier })
    .populate('createdBy', 'firstName lastName email')
    .populate('programId', 'title description slug');

  if (!course) {
    course = await Course.findById(identifier)
      .populate('createdBy', 'firstName lastName email')
      .populate('programId', 'title description slug');
  }

  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  if (!course.isPublished) {
  const isOwner = req.user && req.user.role === UserRole.INSTRUCTOR && course.createdBy.toString() === req.user._id.toString();
  const isAdmin = req.user && req.user.role === UserRole.ADMIN;
  if (!isOwner && !isAdmin) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }
}


  const modules = await Module.find({ courseId: course._id, isPublished: true }).sort({ order: 1 });

  const totalLessons = await Lesson.countDocuments({
    moduleId: { $in: modules.map((m) => m._id) },
    isPublished: true,
  });

  const totalAssessments = await Assessment.countDocuments({
    courseId: course._id,
    isPublished: true,
  });

  res.status(200).json({
    success: true,
    data: {
      course,
      modules,
      stats: {
        totalModules: modules.length,
        totalLessons,
        totalAssessments,
      },
    },
  });
});

// ============================================
// ADMIN / INSTRUCTOR COURSE MANAGEMENT
// ============================================

// @desc    Get all courses (admin & instructor, includes unpublished)
// @route   GET /api/courses/admin/all
// @access  Admin & Instructor
export const getAllCoursesAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { isPublished, page = '1', limit = '10', programId } = req.query;

  const filter: any = {};
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true';
  if (programId) filter.programId = programId;

  // Instructors should only see their own (unless admin)
  if (req.user?.role === UserRole.INSTRUCTOR) {
    filter.$or = [{ createdBy: req.user._id }, { instructorId: req.user._id }];
  }

  let query = Course.find(filter)
    .populate('createdBy', 'firstName lastName')
    .populate('programId', 'title slug')
    .populate('instructorId', 'firstName lastName');

  const queryHelper = new QueryHelper(query, req.query);

  query = queryHelper
    .filter()
    .search(['title', 'description', 'targetAudience'])
    .sort()
    .paginate()
    .query;

  const total = await Course.countDocuments(filter);
  const courses = await query;

  res.status(200).json({
    success: true,
    count: courses.length,
    total,
    page: parseInt(page as string, 10),
    pages: Math.ceil(total / parseInt(limit as string, 10)),
    data: courses,
  });
});

// @desc    Create new course
// @route   POST /api/courses/admin/create
// @access  Admin & Instructor
export const createCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authorized' });
    return;
  }

  if (![UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      error: 'Access denied. Only admins and instructors can create courses.',
    });
    return;
  }

  const {
    programId,
    order,
    title,
    slug,
    description,
    estimatedHours,
    objectives,
    prerequisites,
    targetAudience,
    completionCriteria,
  } = req.body;

  if (!programId || !title || !description || !targetAudience || !slug) {
    res.status(400).json({
      success: false,
      error: 'Please provide programId, title, description, targetAudience, and slug',
    });
    return;
  }

  const slugExists = await Course.findOne({ slug });
  if (slugExists) {
    res.status(400).json({ success: false, error: 'A course with this slug already exists' });
    return;
  }

  const programExists = await Program.findById(programId);
  if (!programExists) {
    res.status(404).json({ success: false, error: 'Program not found' });
    return;
  }

  let coverImage: string | undefined;
  if (req.file) coverImage = req.file.path;

  const approvalStatus = req.user.role === UserRole.ADMIN ? 'approved' : 'pending';

  const course = await Course.create({
    programId,
    order: order || 1,
    title,
    slug,
    description,
    estimatedHours,
    objectives: objectives || [],
    prerequisites: prerequisites || [],
    targetAudience,
    coverImage,
    completionCriteria: completionCriteria || {
      minimumQuizScore: 70,
      requiredProjects: 5,
      capstoneRequired: true,
    },
    instructorId: req.user._id,
    createdBy: req.user._id,
    approvalStatus,
    isPublished: false,
  });

  
// Keep Program.courses and courseCount in sync
await Program.findByIdAndUpdate(
  programId,
  {
    $addToSet: { courses: course._id },
    $inc: { courseCount: 1 }
  },
  { new: true }
);

res.status(201).json({
  success: true,
  message:
    req.user.role === UserRole.ADMIN
      ? 'Course created and approved successfully'
      : 'Course created and submitted for admin approval',
  data: course,
});

});

// @desc    Update course
// @route   PUT /api/courses/admin/:id
// @access  Admin & Instructor (own courses only)
export const updateCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authorized' });
    return;
  }

  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  if (req.user.role === UserRole.INSTRUCTOR && course.createdBy.toString() !== req.user._id.toString()) {
    res.status(403).json({ success: false, error: 'You can only update your own courses' });
    return;
  }

  const {
    order,
    title,
    slug,
    description,
    estimatedHours,
    objectives,
    prerequisites,
    targetAudience,
    completionCriteria,
    isPublished,
  } = req.body;

  // Slug uniqueness check
  if (slug && slug !== course.slug) {
    const exists = await Course.findOne({ slug });
    if (exists) {
      res.status(400).json({ success: false, error: 'A course with this slug already exists' });
      return;
    }
  }

  if (order !== undefined) course.order = order;
  if (title) course.title = title;
  if (slug) course.slug = slug;
  if (description) course.description = description;
  if (estimatedHours !== undefined) course.estimatedHours = estimatedHours;
  if (objectives) course.objectives = objectives;
  if (prerequisites) course.prerequisites = prerequisites;
  if (targetAudience) course.targetAudience = targetAudience;
  if (completionCriteria) course.completionCriteria = completionCriteria;

  const wasPublished = course.isPublished;

  if (req.user.role === UserRole.ADMIN) {
    if (isPublished !== undefined) course.isPublished = isPublished;
  } else if (req.user.role === UserRole.INSTRUCTOR) {
    course.approvalStatus = 'pending';
    course.isPublished = false;
  }

  if (req.file) {
    if (course.coverImage) {
      try {
        const publicId = CloudinaryHelper.extractPublicId(course.coverImage);
        if (publicId) await CloudinaryHelper.deleteFile(publicId, 'image');
      } catch (err) {
        console.error('Error deleting old cover image:', err);
      }
    }
    course.coverImage = req.file.path;
  }

  await course.save();

  // Notify students if course remains published after update
  if (wasPublished && course.isPublished) {
    try {
      const notification = NotificationTemplates.announcement(
        'Course Updated',
        `${course.title} has been updated with new content or information`
      );

      await notifyCourseStudents(course._id, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: course._id,
        relatedModel: 'Course',
      });
    } catch (err) {
      console.error('Error sending course update notifications:', err);
    }
  }

  const message =
    req.user.role === UserRole.ADMIN
      ? 'Course updated successfully'
      : 'Course updated and submitted for admin approval';

  res.status(200).json({ success: true, message, data: course });
});

// @route   PATCH /api/courses/:id/approve
// @access  Admin only
export const approveCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  const wasUnpublished = !course.isPublished;
  course.approvalStatus = 'approved';
  course.isPublished = true;

  await course.save();

  if (wasUnpublished) {
    try {
      const notification = NotificationTemplates.announcement(
        'New Course Available',
        `${course.title} is now available in your program`
      );

      await notifyCourseStudents(course._id, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: course._id,
        relatedModel: 'Course',
      });
    } catch (err) {
      console.error('Error sending course approval notifications:', err);
    }
  }

  res.json({ success: true, message: 'Course approved & published', data: course });
});

// @route   PATCH /api/courses/:id/reject
// @access  Admin only
export const rejectCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id).populate('createdBy');

  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  course.approvalStatus = 'rejected';
  course.isPublished = false;

  await course.save();

  // Notify instructor about rejection
  try {
    const instructor = course.createdBy as any;
    await pushNotification({
      userId: instructor._id,
      type: NotificationType.ANNOUNCEMENT,
      title: 'Course Rejected',
      message: `Your course "${course.title}" has been rejected. Please review and resubmit.`,
      relatedId: course._id,
      relatedModel: 'Course',
    });
  } catch (err) {
    console.error('Error sending rejection notification:', err);
  }

  res.json({ success: true, message: 'Course rejected', data: course });
});

// @desc    Delete course and its content
// @route   DELETE /api/courses/:id
// @access  Admin & Instructor (own)
export const deleteCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  // Prevent delete if enrollments exist for this course
  const enrollmentCount = await Enrollment.countDocuments({
    programId: course.programId,
    'coursesProgress.courseId': course._id,
  });

  if (enrollmentCount > 0) {
    res.status(400).json({
      success: false,
      error: `Cannot delete course with ${enrollmentCount} student enrollments. Please remove enrollments first.`,
    });
    return;
  }

  // Delete cover image if exists
  if (course.coverImage) {
    try {
      const publicId = CloudinaryHelper.extractPublicId(course.coverImage);
      if (publicId) await CloudinaryHelper.deleteFile(publicId, 'image');
    } catch (err) {
      console.error('Error deleting cover image:', err);
    }
  }

  // Cascade delete: lessons -> modules -> assessments -> progress
  const modules = await Module.find({ courseId: course._id });
  const moduleIds = modules.map((m) => m._id);

  await Lesson.deleteMany({ moduleId: { $in: moduleIds } });
  await Module.deleteMany({ courseId: course._id });
  await Assessment.deleteMany({ courseId: course._id });
  await Progress.deleteMany({ courseId: course._id });


await Program.findByIdAndUpdate(
  course.programId,
  { 
    $pull: { courses: course._id },
    $inc: { courseCount: -1 }
  }
);

  await course.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Course and all related content deleted successfully',
  });
});

// @desc    Toggle publish state
// @route   PATCH /api/courses/:id/toggle-publish
// @access  Admin only

export const toggleCoursePublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  // Instructors can only toggle their own course
  if (req.user?.role === UserRole.INSTRUCTOR && course.createdBy.toString() !== req.user._id.toString()) {
    res.status(403).json({ success: false, error: 'You can only publish/unpublish your own courses' });
    return;
  }


  if (!course.isPublished) {
    const moduleCount = await Module.countDocuments({ courseId: course._id });
    if (moduleCount === 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot publish course without modules. Please add content first.',
      });
      return;
    }
  }

  const wasUnpublished = !course.isPublished;
  course.isPublished = !course.isPublished;
  await course.save();

  if (wasUnpublished && course.isPublished) {
    try {
      const notification = NotificationTemplates.announcement(
        'Course Now Available',
        `${course.title} is now published and ready to access`
      );

      await notifyCourseStudents(course._id, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: course._id,
        relatedModel: 'Course',
      });
    } catch (err) {
      console.error('Error sending publish notifications:', err);
    }
  }

  res.status(200).json({
    success: true,
    message: `Course ${course.isPublished ? 'published' : 'unpublished'} successfully`,
    data: course,
  });
});

// @desc    Get course content (modules, lessons, assessments)
// @route   GET /api/courses/:id/content
// @access  Admin & Instructor (own) & Enrolled students (to be enforced via middleware)
export const getCourseContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id)
    .populate('programId', 'title')
    .populate('createdBy', 'firstName lastName email');

  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  const modules = await Module.find({ courseId: course._id }).sort({ order: 1 });
  const moduleIds = modules.map((m) => m._id);

  const lessons = await Lesson.find({ moduleId: { $in: moduleIds } }).sort({ order: 1 });

  const assessments = await Assessment.find({ courseId: course._id }).sort({ order: 1 });

  const structuredModules = modules.map((module) => ({
    ...module.toObject(),
    lessons: lessons.filter((l) => l.moduleId.toString() === module._id.toString()),
    assessments: assessments.filter(
      (a) => a.moduleId && a.moduleId.toString() === module._id.toString()
    ),
  }));

  const courseAssessments = assessments.filter((a) => !a.moduleId);

  // Enrollment stats (by course)
  const enrollmentStats = await Enrollment.aggregate([
    {
      $match: {
        programId: course.programId,
        'coursesProgress.courseId': course._id,
      },
    },
    { $unwind: '$coursesProgress' },
    {
      $match: {
        'coursesProgress.courseId': course._id,
      },
    },
    {
      $group: {
        _id: '$coursesProgress.status',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      course,
      modules: structuredModules,
      courseAssessments,
      enrollmentStats,
      stats: {
        totalModules: modules.length,
        totalLessons: lessons.length,
        totalAssessments: assessments.length,
        publishedModules: modules.filter((m) => m.isPublished).length,
        publishedLessons: lessons.filter((l) => l.isPublished).length,
      },
    },
  });
});

// @desc    Get enrollments for a specific course
// @route   GET /api/courses/:id/enrollments
// @access  Admin & Instructor
export const getCourseEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  const { status, cohort, page = '1', limit = '20' } = req.query;

  const filter: any = {
    programId: course.programId,
    'coursesProgress.courseId': course._id,
  };
  if (status) filter['coursesProgress.status'] = status;
  if (cohort) filter.cohort = cohort;

  const total = await Enrollment.countDocuments(filter);

  const enrollments = await Enrollment.find(filter)
    .populate('studentId', 'firstName lastName email profileImage')
    .populate('programId', 'title')
    .sort({ enrollmentDate: -1 })
    .skip((parseInt(page as string, 10) - 1) * parseInt(limit as string, 10))
    .limit(parseInt(limit as string, 10));

  const enrollmentsWithCourseProgress = enrollments.map((enrollment) => {
    const courseProgress = enrollment.coursesProgress.find(
      (cp) => cp.courseId.toString() === course._id.toString()
    );
    return {
      ...enrollment.toObject(),
      courseProgress,
    };
  });

  res.status(200).json({
    success: true,
    count: enrollmentsWithCourseProgress.length,
    total,
    page: parseInt(page as string, 10),
    pages: Math.ceil(total / parseInt(limit as string, 10)),
    data: enrollmentsWithCourseProgress,
  });
});

// @desc    Course stats
// @route   GET /api/courses/:id/stats
// @access  Admin & Instructor
export const getCourseStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return;
  }

  const totalEnrollments = await Enrollment.countDocuments({
    programId: course.programId,
    'coursesProgress.courseId': course._id,
  });

  const activeEnrollments = await Enrollment.countDocuments({
    programId: course.programId,
    'coursesProgress.courseId': course._id,
    'coursesProgress.status': 'active',
  });

  const completedEnrollments = await Enrollment.countDocuments({
    programId: course.programId,
    'coursesProgress.courseId': course._id,
    'coursesProgress.status': 'completed',
  });

  const progressData = await Progress.find({ courseId: course._id });
  const averageProgress =
    progressData.length > 0
      ? progressData.reduce((sum, p) => sum + (p.overallProgress || 0), 0) / progressData.length
      : 0;

  const averageScore =
    progressData.length > 0
      ? progressData.reduce((sum, p) => sum + (p.averageScore || 0), 0) / progressData.length
      : 0;

  const completionRate = totalEnrollments > 0 ? (completedEnrollments / totalEnrollments) * 100 : 0;

  const totalModules = await Module.countDocuments({ courseId: course._id });
  const moduleIds = await Module.find({ courseId: course._id }).distinct('_id');
  const totalLessons = await Lesson.countDocuments({ moduleId: { $in: moduleIds } });
  const totalAssessments = await Assessment.countDocuments({ courseId: course._id });

  res.status(200).json({
    success: true,
    data: {
      enrollments: {
        total: totalEnrollments,
        active: activeEnrollments,
        completed: completedEnrollments,
        completionRate: Math.round(completionRate * 100) / 100,
      },
      progress: {
        averageProgress: Math.round(averageProgress * 100) / 100,
        averageScore: Math.round(averageScore * 100) / 100,
      },
      content: {
        modules: totalModules,
        lessons: totalLessons,
        assessments: totalAssessments,
      },
      currentEnrollment: course.currentEnrollment || 0,
    },
  });
});

// @desc    My enrolled courses (flattened)
// @route   GET /api/courses/me/enrollments
// @access  Student
export const getMyEnrolledCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authorized' });
    return;
  }

  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate('programId', 'title slug')
    .sort({ enrollmentDate: -1 })
    .lean();

  const courseIds: string[] = [];
  enrollments.forEach(en => {
    (en.coursesProgress || []).forEach(cp => {
      if (cp.courseId) courseIds.push(cp.courseId.toString());
    });
  });

  const uniqueCourseIds = Array.from(new Set(courseIds));
  const courses = await Course.find({ _id: { $in: uniqueCourseIds } })
    .populate('programId', 'title slug coverImage')
    .lean();

  const courseMap = new Map(courses.map(c => [c._id.toString(), c]));

  const progresses = await Progress.find({
    studentId: req.user._id,
    courseId: { $in: uniqueCourseIds }
  }).lean();
  const progressMap = new Map(progresses.map(p => [p.courseId?.toString(), p]));

  const out: any[] = [];
  for (const en of enrollments) {
    for (const cp of en.coursesProgress || []) {
      const cid = cp.courseId?.toString();
      if (!cid) continue;

      out.push({
        course: courseMap.get(cid) || null,
        enrollmentStatus: cp.status,
        lessonsCompleted: cp.lessonsCompleted,
        totalLessons: cp.totalLessons,
        completionDate: cp.completionDate,
        progress: progressMap.get(cid) || null,
        program: en.programId, // handy to include
      });
    }
  }

  res.status(200).json({
    success: true,
    count: out.length,
    data: out,
  });
});

// Placeholder: enroll in course (to be implemented)
export const enrollInCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findOne({});
  res.status(200).json({ success: true, data: course });
});