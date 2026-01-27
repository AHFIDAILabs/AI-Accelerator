// ============================================
// src/controllers/studentDashboard.controller.ts
// ============================================

import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { User } from "../models/user";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Course } from "../models/Course";
import { Program } from "../models/program";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Progress, IProgress, IModuleProgress, ILessonProgress } from "../models/ProgressTrack";
import { Notification } from "../models/Notification";
import { Assessment } from "../models/Assessment";

// ======================================================
// DASHBOARD OVERVIEW
// ======================================================
export const getDashboardOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Get all program enrollments
  const enrollments = await Enrollment.find({ 
    studentId: req.user._id,
    status: { $in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PENDING] }
  }).populate('program', 'title');

  const totalPrograms = enrollments.length;

  // Calculate active courses across all programs
  const totalActiveCourses = enrollments.reduce((sum, enrollment) => {
    return sum + enrollment.coursesProgress.filter(
      cp => cp.status === EnrollmentStatus.ACTIVE || cp.status === EnrollmentStatus.PENDING
    ).length;
  }, 0);

  // Get all progress entries
  const progressList = await Progress.find({ studentId: req.user._id });

  // Calculate overall progress across all courses
  const overallProgress = progressList.length > 0
    ? Math.round(progressList.reduce((sum, p) => sum + p.overallProgress, 0) / progressList.length)
    : 0;

  const totalLessonsCompleted = progressList.reduce((sum, p) => sum + p.completedLessons, 0);
  const totalLessons = progressList.reduce((sum, p) => sum + p.totalLessons, 0);
  const totalAssessmentsCompleted = progressList.reduce((sum, p) => sum + p.completedAssessments, 0);
  const totalAssessments = progressList.reduce((sum, p) => sum + p.totalAssessments, 0);

  // Calculate average score
  const progressWithScores = progressList.filter(p => p.averageScore > 0);
  const averageScore = progressWithScores.length > 0
    ? Math.round(progressWithScores.reduce((sum, p) => sum + p.averageScore, 0) / progressWithScores.length)
    : 0;

  // Get unread notifications count
  const unreadNotifications = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });

  // Get upcoming deadlines (assessments with end dates)
  const upcomingDeadlines = await Assessment.find({
    endDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // Next 7 days
    isPublished: true
  })
  .select('title endDate courseId')
  .sort({ endDate: 1 })
  .limit(5);

  // Calculate streak (days of continuous activity)
  const recentProgress = progressList.filter(p => 
    p.lastAccessedAt && p.lastAccessedAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const hasActivityToday = recentProgress.some(p => 
    p.lastAccessedAt && p.lastAccessedAt >= new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  res.status(200).json({
    success: true,
    data: {
      programs: {
        total: totalPrograms,
        active: enrollments.filter(e => e.status === EnrollmentStatus.ACTIVE).length,
      },
      courses: {
        total: totalActiveCourses,
        overallProgress,
      },
      lessons: {
        completed: totalLessonsCompleted,
        total: totalLessons,
        completionRate: totalLessons > 0 
          ? Math.round((totalLessonsCompleted / totalLessons) * 100) 
          : 0
      },
      assessments: {
        completed: totalAssessmentsCompleted,
        total: totalAssessments,
        averageScore,
      },
      activity: {
        unreadNotifications,
        upcomingDeadlines: upcomingDeadlines.length,
        hasActivityToday,
      }
    },
  });
});

// ======================================================
// GET ENROLLED PROGRAMS
// ======================================================
export const getEnrolledPrograms = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate({
      path: 'program',
      select: 'title description slug coverImage estimatedHours courses',
      populate: {
        path: 'courses',
        select: 'title order estimatedHours'
      }
    })
    .sort({ enrollmentDate: -1 });

  // Enhance with progress data
  const programsWithProgress = await Promise.all(
    enrollments.map(async (enrollment) => {
      const program = enrollment.program as any;
      
      // Get progress for all courses in this program
      const courseIds = enrollment.coursesProgress.map(cp => cp.course);
      const courseProgress = await Progress.find({
        studentId: req.user!._id,
        courseId: { $in: courseIds }
      });

      const totalProgress = courseProgress.reduce((sum, cp) => sum + cp.overallProgress, 0);
      const averageProgress = courseProgress.length > 0 
        ? totalProgress / courseProgress.length 
        : 0;

      const completedCourses = enrollment.coursesProgress.filter(
        cp => cp.status === EnrollmentStatus.COMPLETED
      ).length;

      return {
        enrollment: enrollment.toObject(),
        stats: {
          overallProgress: Math.round(averageProgress),
          completedCourses,
          totalCourses: enrollment.coursesProgress.length,
          status: enrollment.status
        }
      };
    })
  );

  res.status(200).json({
    success: true,
    count: programsWithProgress.length,
    data: programsWithProgress,
  });
});

// ======================================================
// GET PROGRAM COURSES WITH PROGRESS
// ======================================================
export const getProgramCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { programId } = req.params;

  const enrollment = await Enrollment.findOne({
    studentId: req.user._id,
    program: programId
  }).populate({
    path: 'program',
    populate: {
      path: 'courses',
      select: 'title description order estimatedHours coverImage'
    }
  });

  if (!enrollment) {
    res.status(404).json({ 
      success: false, 
      error: "Not enrolled in this program" 
    });
    return;
  }

  const program = enrollment.program as any;
  
  // Get progress for each course
  const coursesWithProgress = await Promise.all(
    program.courses.map(async (course: any) => {
      const courseProgressData = enrollment.coursesProgress.find(
        cp => cp.course.toString() === course._id.toString()
      );

      const progress = await Progress.findOne({
        studentId: req.user!._id,
        courseId: course._id
      });

      return {
        course: course.toObject(),
        enrollmentStatus: courseProgressData?.status || EnrollmentStatus.PENDING,
        lessonsCompleted: courseProgressData?.lessonsCompleted || 0,
        totalLessons: courseProgressData?.totalLessons || 0,
        progress: progress ? {
          overallProgress: progress.overallProgress,
          completedAssessments: progress.completedAssessments,
          averageScore: progress.averageScore,
          lastAccessedAt: progress.lastAccessedAt
        } : null
      };
    })
  );

  res.status(200).json({
    success: true,
    data: {
      program,
      courses: coursesWithProgress
    }
  });
});

// ======================================================
// GET COURSE MODULES WITH PROGRESS
// ======================================================
export const getCourseModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { courseId } = req.params;

  const course = await Course.findById(courseId)
    .populate('program', 'title');

  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  const modules = await Module.find({ 
    course: courseId,
    isPublished: true 
  }).sort({ order: 1 });

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: courseId
  });

  // Map progress to modules
  const modulesWithProgress = modules.map(module => {
    const moduleProgress = progress?.modules.find(
      m => m.moduleId.toString() === module._id.toString()
    );

    return {
      module: module.toObject(),
      progress: moduleProgress ? {
        completionPercentage: moduleProgress.completionPercentage,
        completedLessons: moduleProgress.lessons.filter(l => l.status === 'completed').length,
        totalLessons: moduleProgress.lessons.length,
        completedAssessments: moduleProgress.assessments.filter(a => a.status === 'completed').length,
        totalAssessments: moduleProgress.assessments.length,
        startedAt: moduleProgress.startedAt,
        completedAt: moduleProgress.completedAt
      } : {
        completionPercentage: 0,
        completedLessons: 0,
        totalLessons: 0,
        completedAssessments: 0,
        totalAssessments: 0
      }
    };
  });

  res.status(200).json({
    success: true,
    data: {
      course,
      modules: modulesWithProgress,
      overallProgress: progress?.overallProgress || 0
    }
  });
});

// ======================================================
// GET MODULE LESSONS WITH PROGRESS
// ======================================================
export const getModuleLessons = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { moduleId } = req.params;

  const module = await Module.findById(moduleId)
    .populate('course', 'title program');

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const lessons = await Lesson.find({ 
    module: moduleId,
    isPublished: true 
  }).sort({ order: 1 });

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: (module.course as any)._id
  });

  let lessonProgressMap: Record<string, ILessonProgress> = {};
  if (progress) {
    const moduleProgress = progress.modules.find(
      m => m.moduleId.toString() === moduleId
    );
    if (moduleProgress) {
      moduleProgress.lessons.forEach(l => {
        lessonProgressMap[l.lessonId.toString()] = l;
      });
    }
  }

  const lessonsWithProgress = lessons.map(lesson => ({
    ...lesson.toObject(),
    progress: lessonProgressMap[lesson._id.toString()] || { 
      status: "not_started",
      timeSpent: 0
    },
  }));

  res.status(200).json({
    success: true,
    data: {
      module,
      lessons: lessonsWithProgress
    }
  });
});

// ======================================================
// GET SINGLE LESSON DETAILS WITH PROGRESS
// ======================================================
export const getLessonDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { lessonId } = req.params;

  const lesson = await Lesson.findById(lessonId)
    .populate({
      path: 'module',
      select: 'title description course sequenceLabel',
      populate: {
        path: 'course',
        select: 'title program'
      }
    });

  if (!lesson || !lesson.isPublished) {
    res.status(404).json({ success: false, error: "Lesson not found" });
    return;
  }

  const module = lesson.module as any;
  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: module.course._id
  });

  let lessonProgress: Partial<ILessonProgress> = {
    status: "not_started",
    timeSpent: 0
  };

  if (progress) {
    const moduleProgress = progress.modules.find(
      m => m.moduleId.toString() === module._id.toString()
    );
    if (moduleProgress) {
      const lProgress = moduleProgress.lessons.find(
        l => l.lessonId.toString() === lessonId
      );
      if (lProgress) {
        lessonProgress = lProgress;
      }
    }
  }

  // Get next and previous lessons
  const allModuleLessons = await Lesson.find({ 
    module: module._id,
    isPublished: true 
  }).sort({ order: 1 }).select('_id title order');

  const currentIndex = allModuleLessons.findIndex(
    l => l._id.toString() === lessonId
  );

  const nextLesson = currentIndex < allModuleLessons.length - 1 
    ? allModuleLessons[currentIndex + 1] 
    : null;
  const previousLesson = currentIndex > 0 
    ? allModuleLessons[currentIndex - 1] 
    : null;

  res.status(200).json({
    success: true,
    data: {
      lesson,
      progress: lessonProgress,
      navigation: {
        next: nextLesson,
        previous: previousLesson,
        currentPosition: currentIndex + 1,
        totalLessons: allModuleLessons.length
      }
    },
  });
});

// ======================================================
// GET COURSE PROGRESS DETAILS
// ======================================================
export const getCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { courseId } = req.params;

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: courseId
  })
  .populate('courseId', 'title description program')
  .populate('programId', 'title')
  .populate({
    path: 'modules.moduleId',
    select: 'title description order sequenceLabel type'
  });

  if (!progress) {
    res.status(404).json({
      success: false,
      error: "No progress found for this course"
    });
    return;
  }

  res.status(200).json({ success: true, data: progress });
});

// ======================================================
// GET STUDENT NOTIFICATIONS
// ======================================================
export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { page = '1', limit = '20', unreadOnly = 'false' } = req.query;

  const filter: any = { userId: req.user._id };
  if (unreadOnly === 'true') {
    filter.isRead = false;
  }

  const total = await Notification.countDocuments(filter);

  const notifications = await Notification.find(filter)
    .populate('programId', 'title slug')
    .sort({ createdAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: notifications,
  });
});

// ======================================================
// MARK NOTIFICATION AS READ
// ======================================================
export const markNotificationRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { notificationId } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    res.status(404).json({ success: false, error: "Notification not found" });
    return;
  }

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

// ======================================================
// MARK ALL NOTIFICATIONS AS READ
// ======================================================
export const markAllNotificationsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    count: result.modifiedCount,
  });
});

// ======================================================
// DELETE NOTIFICATION
// ======================================================
export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { notificationId } = req.params;

  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    userId: req.user._id,
  });

  if (!notification) {
    res.status(404).json({ success: false, error: "Notification not found" });
    return;
  }

  res.status(200).json({
    success: true,
    message: "Notification deleted successfully",
  });
});

// ======================================================
// GET RECENT ACTIVITY
// ======================================================
export const getRecentActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { limit = '10' } = req.query;

  // Get recent progress updates
  const recentProgress = await Progress.find({ studentId: req.user._id })
    .sort({ lastAccessedAt: -1 })
    .limit(parseInt(limit as string))
    .populate('courseId', 'title')
    .populate('programId', 'title')
    .select('courseId programId lastAccessedAt overallProgress');

  res.status(200).json({
    success: true,
    data: recentProgress
  });
});

// ======================================================
// GET LEARNING STATISTICS
// ======================================================
export const getLearningStatistics = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { timeframe = '30' } = req.query; // days
  const days = parseInt(timeframe as string);
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const progressList = await Progress.find({ 
    studentId: req.user._id,
    lastAccessedAt: { $gte: startDate }
  });

  // Calculate stats
  const totalTimeSpent = progressList.reduce((sum, p) => sum + (p.totalTimeSpent || 0), 0);
  const lessonsCompleted = progressList.reduce((sum, p) => sum + p.completedLessons, 0);
  const assessmentsCompleted = progressList.reduce((sum, p) => sum + p.completedAssessments, 0);

  // Get completion trend (group by day)
  const dailyActivity = progressList.reduce((acc, p) => {
    if (p.lastAccessedAt) {
      const date = p.lastAccessedAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { lessons: 0, assessments: 0, time: 0 };
      }
      acc[date].lessons += p.completedLessons;
      acc[date].assessments += p.completedAssessments;
      acc[date].time += p.totalTimeSpent;
    }
    return acc;
  }, {} as Record<string, any>);

  res.status(200).json({
    success: true,
    data: {
      timeframe: days,
      summary: {
        totalTimeSpent: Math.round(totalTimeSpent * 10) / 10, // hours
        lessonsCompleted,
        assessmentsCompleted,
        activeDays: Object.keys(dailyActivity).length
      },
      dailyActivity: Object.entries(dailyActivity).map(([date, stats]) => ({
        date,
        ...stats
      })).sort((a, b) => a.date.localeCompare(b.date))
    }
  });
});


// ============================================
// GET ENROLLED COURSES FOR A STUDENT
// ============================================
export const getEnrolledCourses = asyncHandler(async (req: AuthRequest, res: Response) => { 
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Get all enrollments for the student
  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate({
      path: 'program',
      select: 'title description slug coverImage estimatedHours courses',
      populate: {
        path: 'courses',
        select: 'title order estimatedHours coverImage'
      }
    })
    .sort({ enrollmentDate: -1 });

  if (!enrollments.length) {
    return res.status(200).json({
      success: true,
      count: 0,
      data: []
    });
  }

  // Map courses with progress
  const coursesWithProgress = await Promise.all(
    enrollments.flatMap(enrollment => enrollment.coursesProgress.map(async cp => {
      const course = (enrollment.program as any).courses.find(
        (c: any) => c._id.toString() === cp.course.toString()
      );

      if (!course) return null;

      const progress = await Progress.findOne({
        studentId: req.user!._id,
        courseId: course._id
      });

      return {
        course: course.toObject(),
        program: {
          _id: (enrollment.program as any)._id,
          title: (enrollment.program as any).title
        },
        enrollmentStatus: cp.status,
        lessonsCompleted: cp.lessonsCompleted || 0,
        totalLessons: cp.totalLessons || 0,
        progress: progress ? {
          overallProgress: progress.overallProgress,
          completedAssessments: progress.completedAssessments,
          averageScore: progress.averageScore,
          lastAccessedAt: progress.lastAccessedAt
        } : null
      };
    }))
  );

 return res.status(200).json({
    success: true,
    count: coursesWithProgress.filter(c => c !== null).length,
    data: coursesWithProgress.filter(c => c !== null)
  });
});
