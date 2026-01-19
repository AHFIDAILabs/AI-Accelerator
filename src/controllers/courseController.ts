// ============================================
// src/controllers/course.controller.ts
// ============================================

import { Response, NextFunction } from 'express';
import { Course, ICourse } from '../models/Course';
import { Module } from '../models/Module';
import { Lesson } from '../models/Lesson';
import { Enrollment } from '../models/Enrollment';
import { Progress } from '../models/ProgressTrack';
import { Assessment } from '../models/Assessment';
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
    const { search, page = '1', limit = '10' } = req.query;

    const filter: any = { isPublished: true };

    let query = Course.find(filter).populate('createdBy', 'firstName lastName');

    const queryHelper = new QueryHelper(query, req.query);

    query = queryHelper
      .filter()   
      .search(['title','description','targetAudience'])
      .sort()
      .paginate()
      .query;

    const total = await Course.countDocuments(filter);

    query = queryHelper.sort().paginate().query;

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

// @desc    Get single course by ID (public)
// @route   GET /api/courses/:id
// @access  Public
export const getCourseById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email');

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

    const modules = await Module.find({ courseId: course._id, isPublished: true })
      .sort({ order: 1 });

    const totalLessons = await Lesson.countDocuments({
      moduleId: { $in: modules.map(m => m._id) },
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
    const { isPublished, search, page = '1', limit = '10' } = req.query;

    const filter: any = {};
    if (isPublished !== undefined) {
      filter.isPublished = isPublished === 'true';
    }

    let query = Course.find(filter).populate('createdBy', 'firstName lastName');

    const queryHelper = new QueryHelper(query, req.query);

    query = queryHelper
      .filter()   
      .search(['title','description','targetAudience'])
      .sort()
      .paginate()
      .query;

    const total = await Course.countDocuments(filter);

    query = queryHelper.sort().paginate().query;

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
      title,
      description,
      duration,
      objectives,
      prerequisites,
      targetAudience,
      startDate,
      endDate,
      enrollmentLimit,
      certificationCriteria,
    } = req.body;

    if (!title || !description || !duration || !targetAudience) {
      res.status(400).json({
        success: false,
        error: 'Please provide title, description, duration, and target audience',
      });
      return;
    }

    if (!duration.weeks || !duration.hoursPerWeek || !duration.totalHours) {
      res.status(400).json({
        success: false,
        error: 'Duration must include weeks, hoursPerWeek, and totalHours',
      });
      return;
    }

    let coverImage: string | undefined;
    if (req.file) {
      coverImage = req.file.path;
    }

    const approvalStatus = req.user.role === 'admin' ? 'approved' : 'pending';
    const isPublished = false;

    const course = await Course.create({
      title,
      description,
      duration,
      objectives: objectives || [],
      prerequisites: prerequisites || [],
      targetAudience,
      coverImage,
      startDate,
      endDate,
      enrollmentLimit,
      certificationCriteria: certificationCriteria || {
        minimumAttendance: 70,
        minimumQuizScore: 70,
        requiredProjects: 5,
        capstoneRequired: true,
      },
      createdBy: req.user._id,
      approvalStatus,
      isPublished,
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
      title,
      description,
      duration,
      objectives,
      prerequisites,
      targetAudience,
      startDate,
      endDate,
      enrollmentLimit,
      certificationCriteria,
      isPublished,
    } = req.body;

    if (title) course.title = title;
    if (description) course.description = description;
    if (duration) course.duration = duration;
    if (objectives) course.objectives = objectives;
    if (prerequisites) course.prerequisites = prerequisites;
    if (targetAudience) course.targetAudience = targetAudience;
    if (startDate !== undefined) course.startDate = startDate;
    if (endDate !== undefined) course.endDate = endDate;
    if (enrollmentLimit !== undefined) course.enrollmentLimit = enrollmentLimit;
    if (certificationCriteria) course.certificationCriteria = certificationCriteria;

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
  if (!course) return res.status(404).json({ error:"Not found" });

  const wasUnpublished = !course.isPublished;

  course.approvalStatus = "approved";
  course.isPublished = true;

  await course.save();

  // Notify all students if newly published
  if (wasUnpublished) {
    try {
      const notification = NotificationTemplates.announcement(
        'New Course Available',
        `${course.title} is now available for enrollment`
      );

      // You can notify by role or cohort
      // For now, this would need a notifyUsersByRole helper
      // await notifyUsersByRole('student', {...});
    } catch (error) {
      console.error('Error sending course approval notifications:', error);
    }
  }

  return res.json({
    success:true,
    message:"Course approved & published",
    data:course
  });
});

export const rejectCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const course = await Course.findById(req.params.id).populate('createdBy');

  if (!course) {
    return res.status(404).json({ error: "Course not found" });
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

 return res.json({
    success:true,
    message:"Course rejected"
  });
});

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Admin only
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

    const enrollmentCount = await Enrollment.countDocuments({ courseId: course._id });
    if (enrollmentCount > 0) {
      res.status(400).json({
        success: false,
        error: `Cannot delete course with ${enrollmentCount} active enrollments. Please remove enrollments first.`,
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

    const modules = await Module.find({ courseId: course._id });
    const moduleIds = modules.map(m => m._id);

    await Lesson.deleteMany({ moduleId: { $in: moduleIds } });
    await Module.deleteMany({ courseId: course._id });
    await Assessment.deleteMany({ courseId: course._id });
    await Progress.deleteMany({ courseId: course._id });

    await course.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Course and all related content deleted successfully',
    });
  }
);

// @desc    Publish/Unpublish course
// @route   PATCH /api/courses/:id/publish
// @access  Admin only
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

// ============================================
// COURSE CONTENT OVERVIEW
// ============================================

// @desc    Get course content structure
// @route   GET /api/courses/:id/content
// @access  Admin & Instructor
export const getCourseContent = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Course not found',
      });
      return;
    }

    const modules = await Module.find({ courseId: course._id })
      .sort({ order: 1 });

    const moduleIds = modules.map(m => m._id);

    const lessons = await Lesson.find({ moduleId: { $in: moduleIds } })
      .sort({ order: 1 });

    const assessments = await Assessment.find({ courseId: course._id })
      .sort({ order: 1 });

    const structuredModules = modules.map(module => ({
      ...module.toObject(),
      lessons: lessons.filter(l => l.moduleId.toString() === module._id.toString()),
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

// ============================================
// COURSE ENROLLMENT MANAGEMENT
// ============================================

// @desc    Get course enrollments
// @route   GET /api/courses/:id/enrollments
// @access  Admin & Instructor
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

    const filter: any = { courseId: course._id };
    if (status) filter.status = status;
    if (cohort) filter.cohort = cohort;

    const total = await Enrollment.countDocuments(filter);

    const enrollments = await Enrollment.find(filter)
      .populate('studentId', 'firstName lastName email cohort profileImage')
      .sort({ enrollmentDate: -1 })
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string));

    res.status(200).json({
      success: true,
      count: enrollments.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: enrollments,
    });
  }
);

// @desc    Get course statistics
// @route   GET /api/courses/:id/stats
// @access  Admin & Instructor
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

    const totalEnrollments = await Enrollment.countDocuments({ courseId: course._id });
    const activeEnrollments = await Enrollment.countDocuments({ 
      courseId: course._id, 
      status: 'active' 
    });
    const completedEnrollments = await Enrollment.countDocuments({ 
      courseId: course._id, 
      status: 'completed' 
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

    const totalModules = await Module.countDocuments({ courseId: course._id });
    const totalLessons = await Lesson.countDocuments({ 
      moduleId: { $in: await Module.find({ courseId: course._id }).distinct('_id') }
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
        capacity: {
          current: course.currentEnrollment,
          limit: course.enrollmentLimit,
          available: course.enrollmentLimit 
            ? course.enrollmentLimit - course.currentEnrollment 
            : null,
        },
      },
    });
  }
);

// ============================================
// STUDENT COURSE ACCESS
// ============================================

// @desc    Get student's enrolled courses
// @route   GET /api/courses/my-courses
// @access  Private (Student)
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
      .populate('courseId')
      .sort({ enrollmentDate: -1 });

    const coursesWithProgress = await Promise.all(
      enrollments.map(async (enrollment) => {
        const progress = await Progress.findOne({
          studentId: req.user!._id,
          courseId: enrollment.courseId._id,
        });

        return {
          enrollment,
          progress,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: coursesWithProgress.length,
      data: coursesWithProgress,
    });
  }
);

// @desc    Enroll in a course
// @route   POST /api/courses/:id/enroll
// @access  Private (Student)

export const enrollInCourse = asyncHandler(
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

    if (!course.isPublished) {
      res.status(400).json({
        success: false,
        error: 'This course is not available for enrollment',
      });
      return;
    }

    if (course.enrollmentLimit && course.currentEnrollment >= course.enrollmentLimit) {
      res.status(400).json({
        success: false,
        error: 'Course enrollment is full',
      });
      return;
    }

    const existingEnrollment = await Enrollment.findOne({
      studentId: req.user._id,
      courseId: course._id,
    });

    if (existingEnrollment) {
      res.status(400).json({
        success: false,
        error: 'You are already enrolled in this course',
      });
      return;
    }

    const enrollment = await Enrollment.create({
      studentId: req.user._id,
      courseId: course._id,
      status: 'active',
      cohort: req.user.cohort,
    });

    await Progress.create({
      studentId: req.user._id,
      courseId: course._id,
      modules: [],
      overallProgress: 0,
    });

    course.currentEnrollment += 1;
    await course.save();

    // Send enrollment notification
    try {
      const notification = NotificationTemplates.courseEnrolled(course.title);

      await pushNotification({
        userId: req.user._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: course._id,
        relatedModel: 'Course',
      });
    } catch (error) {
      console.error('Error sending enrollment notification:', error);
    }

    res.status(201).json({
      success: true,
      message: 'Successfully enrolled in course',
      data: enrollment,
    });
  }
);