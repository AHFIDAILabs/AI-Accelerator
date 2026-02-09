// ============================================
// src/controllers/course.controller.ts (UPDATED)
// ============================================

import { Response } from 'express';
import { Course, ICourse } from '../models/Course';
import { Module } from '../models/Module';
import { Lesson } from '../models/Lesson';
import { Enrollment } from '../models/Enrollment';
import { Progress } from '../models/ProgressTrack';
import { Assessment } from '../models/Assessment';
import { Program } from '../models/program';
import { AuthRequest } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
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
export const getAllCourses = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { search, page = '1', limit = '10', programId } = req.query;

    const filter: any = { isPublished: true };
    if (programId) filter.program = programId;

    let query = Course.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('program', 'title slug');

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
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: courses,
    });
  }
);

// @desc    Get single course by ID or SLUG (public)
// @route   GET /api/courses/:id
// @access  Public
export const getCourseById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const identifier = req.params.id;
    
    // Try to find by slug first, then by ID
    let course = await Course.findOne({ slug: identifier })
      .populate('createdBy', 'firstName lastName email')
      .populate('program', 'title description slug');
    
    if (!course) {
      course = await Course.findById(identifier)
        .populate('createdBy', 'firstName lastName email')
        .populate('program', 'title description slug');
    }

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    if (!course.isPublished && (!req.user || req.user.role !== 'admin')) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    const modules = await Module.find({ course: course._id, isPublished: true })
      .sort({ order: 1 });

    const totalLessons = await Lesson.countDocuments({
      module: { $in: modules.map(m => m._id) },
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
  }
);

// ============================================
// ADMIN COURSE MANAGEMENT
// ============================================

// @desc    Get all courses (admin - includes unpublished)
// @route   GET /api/courses/admin/all
// @access  Admin & Instructor

export const getAllCoursesAdmin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { isPublished, search, page = '1', limit = '10', programId } = req.query;

    const filter: any = {};
    if (isPublished !== undefined) {
      filter.isPublished = isPublished === 'true';
    }
    if (programId) filter.program = programId;

    let query = Course.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('program', 'title slug');

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
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: courses,
    });
  }
);

// @desc    Create new course
// @route   POST /api/courses/admin/create
// @access  Admin & Instructor
export const createCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    if (!['admin', 'instructor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Only admins and instructors can create courses.',
      });
      return;
    }

    const {
      program,
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

    if (!program || !title || !description || !targetAudience || !slug) {
      res.status(400).json({
        success: false,
        error: 'Please provide program, title, description, target audience, and slug',
      });
      return;
    }

    // Check if slug already exists
    const existingCourse = await Course.findOne({ slug });
    if (existingCourse) {
      res.status(400).json({
        success: false,
        error: 'A course with this slug already exists',
      });
      return;
    }

    // Verify program exists
    const programExists = await Program.findById(program);
    if (!programExists) {
      res.status(404).json({
        success: false,
        error: 'Program not found',
      });
      return;
    }

    let coverImage: string | undefined;
    if (req.file) {
      coverImage = req.file.path;
    }

    const approvalStatus = req.user.role === 'admin' ? 'approved' : 'pending';
    const isPublished = false;

   // In your backend controller
const course = await Course.create({
  program,
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
  instructor: req.user._id,  // ✅ ADD THIS
  createdBy: req.user._id,
  approvalStatus,
  isPublished,
});

    // Add course to program's courses array
    await Program.findByIdAndUpdate(program, {
      $addToSet: { courses: course._id }
    });

    res.status(201).json({
      success: true,
      message:
        req.user.role === 'admin'
          ? 'Course created and approved successfully'
          : 'Course created and submitted for admin approval',
      data: course,
    });
  }
);

// @desc    Update course
// @route   PUT /api/courses/admin/:id
// @access  Admin & Instructor (own courses only)
export const updateCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    if (req.user.role === 'instructor' && 
        course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: 'You can only update your own courses',
      });
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

    // Check if slug is being changed and if new slug already exists
    if (slug && slug !== course.slug) {
      const existingCourse = await Course.findOne({ slug });
      if (existingCourse) {
        res.status(400).json({
          success: false,
          error: 'A course with this slug already exists',
        });
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

    if (req.user.role === 'admin') {
      if (isPublished !== undefined) course.isPublished = isPublished;
    } else if (req.user.role === 'instructor') {
      course.approvalStatus = 'pending';
      course.isPublished = false;
    }

    if (req.file) {
      if (course.coverImage) {
        try {
          const publicId = CloudinaryHelper.extractPublicId(course.coverImage);
          if (publicId) {
            await CloudinaryHelper.deleteFile(publicId, 'image');
          }
        } catch (error) {
          console.error('Error deleting old cover image:', error);
        }
      }
      course.coverImage = req.file.path;
    }

    await course.save();

    // Notify students if course was updated and is published
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
      } catch (error) {
        console.error('Error sending course update notifications:', error);
      }
    }

    const message = req.user.role === 'admin'
      ? 'Course updated successfully'
      : 'Course updated and submitted for admin approval';

    res.status(200).json({
      success: true,
      message,
      data: course,
    });
  }
);

// @route PATCH /api/courses/:id/approve
// @access Admin only
export const approveCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  const wasUnpublished = !course.isPublished;

  course.approvalStatus = "approved";
  course.isPublished = true;

  await course.save();

  // Notify enrolled students if newly published
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
    } catch (error) {
      console.error('Error sending course approval notifications:', error);
    }
  }

  res.json({
    success: true,
    message: "Course approved & published",
    data: course
  });
});

export const rejectCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id).populate('createdBy');

  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  course.approvalStatus = "rejected";
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
  } catch (error) {
    console.error('Error sending rejection notification:', error);
  }

  res.json({
    success: true,
    message: "Course rejected",
    data: course
  });
});

export const deleteCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    // Check if students are enrolled in the program containing this course
    const enrollmentCount = await Enrollment.countDocuments({ 
      program: course.program,
      'coursesProgress.course': course._id 
    });

    if (enrollmentCount > 0) {
      res.status(400).json({
        success: false,
        error: `Cannot delete course with ${enrollmentCount} student enrollments. Please remove enrollments first.`,
      });
      return;
    }

    if (course.coverImage) {
      try {
        const publicId = CloudinaryHelper.extractPublicId(course.coverImage);
        if (publicId) {
          await CloudinaryHelper.deleteFile(publicId, 'image');
        }
      } catch (error) {
        console.error('Error deleting cover image:', error);
      }
    }

    const modules = await Module.find({ course: course._id });
    const moduleIds = modules.map(m => m._id);

    await Lesson.deleteMany({ module: { $in: moduleIds } });
    await Module.deleteMany({ course: course._id });
    await Assessment.deleteMany({ courseId: course._id });
    await Progress.deleteMany({ courseId: course._id });

    // Remove course from program's courses array
    await Program.findByIdAndUpdate(course.program, {
      $pull: { courses: course._id }
    });

    await course.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Course and all related content deleted successfully',
    });
  }
);

export const toggleCoursePublish = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    if (!course.isPublished) {
      const moduleCount = await Module.countDocuments({ course: course._id });
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

    // Notify enrolled students when course is published
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
      } catch (error) {
        console.error('Error sending publish notifications:', error);
      }
    }

    res.status(200).json({
      success: true,
      message: `Course ${course.isPublished ? 'published' : 'unpublished'} successfully`,
      data: course,
    });
  }
);

export const getCourseContent = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id).populate('program', 'title');

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    const modules = await Module.find({ course: course._id })
      .sort({ order: 1 });

    const moduleIds = modules.map(m => m._id);

    const lessons = await Lesson.find({ module: { $in: moduleIds } })
      .sort({ order: 1 });

    const assessments = await Assessment.find({ courseId: course._id })
      .sort({ order: 1 });

    const structuredModules = modules.map(module => ({
      ...module.toObject(),
      lessons: lessons.filter(l => l.module.toString() === module._id.toString()),
      assessments: assessments.filter(a => 
        a.moduleId && a.moduleId.toString() === module._id.toString()
      ),
    }));

    const courseAssessments = assessments.filter(a => !a.moduleId);

    res.status(200).json({
      success: true,
      data: {
        course,
        modules: structuredModules,
        courseAssessments,
        stats: {
          totalModules: modules.length,
          totalLessons: lessons.length,
          totalAssessments: assessments.length,
          publishedModules: modules.filter(m => m.isPublished).length,
          publishedLessons: lessons.filter(l => l.isPublished).length,
        },
      },
    });
  }
);

export const getCourseEnrollments = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    const { status, cohort, page = '1', limit = '20' } = req.query;

    const filter: any = { 
      program: course.program,
      'coursesProgress.course': course._id 
    };
    if (status) filter['coursesProgress.status'] = status;
    if (cohort) filter.cohort = cohort;

    const total = await Enrollment.countDocuments(filter);

    const enrollments = await Enrollment.find(filter)
      .populate('studentId', 'firstName lastName email cohort profileImage')
      .populate('program', 'title')
      .sort({ enrollmentDate: -1 })
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string));

    // Extract course-specific progress
    const enrollmentsWithCourseProgress = enrollments.map(enrollment => {
      const courseProgress = enrollment.coursesProgress.find(
        cp => cp.course.toString() === course._id.toString()
      );
      return {
        ...enrollment.toObject(),
        courseProgress
      };
    });

    res.status(200).json({
      success: true,
      count: enrollmentsWithCourseProgress.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: enrollmentsWithCourseProgress,
    });
  }
);

export const getCourseStats = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    const totalEnrollments = await Enrollment.countDocuments({ 
      program: course.program,
      'coursesProgress.course': course._id 
    });

    const activeEnrollments = await Enrollment.countDocuments({ 
      program: course.program,
      'coursesProgress.course': course._id,
      'coursesProgress.status': 'active'
    });

    const completedEnrollments = await Enrollment.countDocuments({ 
      program: course.program,
      'coursesProgress.course': course._id,
      'coursesProgress.status': 'completed'
    });

    const progressData = await Progress.find({ courseId: course._id });
    const averageProgress = progressData.length > 0
      ? progressData.reduce((sum, p) => sum + p.overallProgress, 0) / progressData.length
      : 0;
    const averageScore = progressData.length > 0
      ? progressData.reduce((sum, p) => sum + p.averageScore, 0) / progressData.length
      : 0;

    const completionRate = totalEnrollments > 0
      ? (completedEnrollments / totalEnrollments) * 100
      : 0;

    const totalModules = await Module.countDocuments({ course: course._id });
    const totalLessons = await Lesson.countDocuments({ 
      module: { $in: await Module.find({ course: course._id }).distinct('_id') }
    });
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
  }
);

export const getMyEnrolledCourses = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    const enrollments = await Enrollment.find({ studentId: req.user._id })
      .populate({
        path: 'program',
        populate: {
          path: 'courses',
          model: 'Course'
        }
      })
      .sort({ enrollmentDate: -1 });

    // Extract all courses with their progress
    const coursesWithProgress = [];
    for (const enrollment of enrollments) {
      for (const courseProgress of enrollment.coursesProgress) {
        const course = await Course.findById(courseProgress.course)
          .populate('program', 'title slug');
        
        const progress = await Progress.findOne({
          studentId: req.user._id,
          courseId: courseProgress.course,
        });

        coursesWithProgress.push({
          course,
          enrollmentStatus: courseProgress.status,
          lessonsCompleted: courseProgress.lessonsCompleted,
          totalLessons: courseProgress.totalLessons,
          completionDate: courseProgress.completionDate,
          progress,
        });
      }
    }

    res.status(200).json({
      success: true,
      count: coursesWithProgress.length,
      data: coursesWithProgress,
    });
  }
);

export const enrollInCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findOne({});
    res.status(200).json({
      success: true,
      data: course,
    });
  } 
);