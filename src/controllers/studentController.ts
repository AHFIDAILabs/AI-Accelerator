// ============================================
// src/controllers/studentDashboard.controller.ts
// ============================================

import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { User, UserRole } from "../models/user";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Course } from "../models/Course";
import { Program } from "../models/program";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Progress, IProgress, IModuleProgress, ILessonProgress } from "../models/ProgressTrack";
import { Notification } from "../models/Notification";
import { Assessment } from "../models/Assessment";
import { Submission } from "../models/Submission";

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
  }).populate('programId', 'title');

  const totalPrograms = enrollments.length;

  // Calculate active courses across all programs
  const totalActiveCourses = enrollments.reduce((sum, enrollment) => {
    return sum + enrollment.coursesProgress.filter(
      (cp: any) => cp.status === EnrollmentStatus.ACTIVE || cp.status === EnrollmentStatus.PENDING
    ).length;
  }, 0);

  // Get all progress entries
  const progressList = await Progress.find({ studentId: req.user._id });

  // Calculate overall progress across all courses
  const overallProgress = progressList.length > 0
    ? Math.round(progressList.reduce((sum, p) => sum + (p.overallProgress || 0), 0) / progressList.length)
    : 0;

  const totalLessonsCompleted = progressList.reduce((sum, p) => sum + (p.completedLessons || 0), 0);
  const totalLessons = progressList.reduce((sum, p) => sum + (p.totalLessons || 0), 0);
  const totalAssessmentsCompleted = progressList.reduce((sum, p) => sum + (p.completedAssessments || 0), 0);
  const totalAssessments = progressList.reduce((sum, p) => sum + (p.totalAssessments || 0), 0);

  // Calculate average score
  const progressWithScores = progressList.filter(p => (p.averageScore || 0) > 0);
  const averageScore = progressWithScores.length > 0
    ? Math.round(progressWithScores.reduce((sum, p) => sum + (p.averageScore || 0), 0) / progressWithScores.length)
    : 0;

  // Get unread notifications count
  const unreadNotifications = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });

  // Upcoming deadlines (assessments with end dates) - global (could be filtered by student's courses if needed)
  const upcomingDeadlines = await Assessment.find({
    endDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    isPublished: true
  })
    .select('title endDate courseId')
    .sort({ endDate: 1 })
    .limit(5);

  // Calculate recent activity indicators
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
      path: 'programId',
      select: 'title description slug coverImage estimatedHours',
    })
    .sort({ enrollmentDate: -1 });

  const programsWithProgress = await Promise.all(
    enrollments.map(async (enrollment: any) => {
      const program = enrollment.programId as any;

      if (!program?._id) return null;

      // ✅ FIX: Count actual courses in DB, not stale enrollment.coursesProgress
      // enrollment.coursesProgress is only written at enrollment time and goes stale
      // when admin adds courses to the program later.
      const [actualCourseCount, courseProgress] = await Promise.all([
        Course.countDocuments({ programId: program._id }),
        Progress.find({
          studentId: req.user!._id,
          courseId: {
            $in: (enrollment.coursesProgress || []).map((cp: any) => cp.courseId),
          },
        }).select('overallProgress'),
      ]);

      const averageProgress =
        courseProgress.length > 0
          ? courseProgress.reduce((sum, cp) => sum + (cp.overallProgress || 0), 0) /
            courseProgress.length
          : 0;

      const completedCourses = (enrollment.coursesProgress || []).filter(
        (cp: any) => cp.status === EnrollmentStatus.COMPLETED
      ).length;

      const enrollmentPlain = enrollment.toObject();
      const { programId: _discarded, ...enrollmentRest } = enrollmentPlain;

      return {
        enrollment: {
          ...enrollmentRest,
          program,
        },
        stats: {
          overallProgress: Math.round(averageProgress),
          completedCourses,
          totalCourses: actualCourseCount, // ✅ live count from DB
          status: enrollment.status,
        },
      };
    })
  );

  const filtered = programsWithProgress.filter(Boolean);

  res.status(200).json({
    success: true,
    count: filtered.length,
    data: filtered,
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
    programId,
  }).populate({
    path: 'programId',
    select: 'title description slug coverImage estimatedHours',
  });

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Not enrolled in this program" });
    return;
  }

  const program = enrollment.programId as any;

  if (!program?._id) {
    res.status(404).json({ success: false, error: "Program no longer exists" });
    return;
  }

  const programCourses = await Course.find(
    { programId: program._id },
    'title description order estimatedHours coverImage isPublished approvalStatus'
  ).sort({ order: 1 });

  if (programCourses.length === 0) {
    return res.status(200).json({
      success: true,
      data: { program, courses: [] },
    });
  }

  const courseIds = programCourses.map((c: any) => c._id);

  // Live lesson count per course
  const moduleDocs = await Module.find({ courseId: { $in: courseIds } }).select('_id courseId');
  const moduleIds = moduleDocs.map((m: any) => m._id);

  const lessonCounts = await Lesson.aggregate([
    { $match: { moduleId: { $in: moduleIds } } },
    {
      $lookup: {
        from: 'modules',
        localField: 'moduleId',
        foreignField: '_id',
        as: 'mod',
      },
    },
    { $unwind: '$mod' },
    { $group: { _id: '$mod.courseId', count: { $sum: 1 } } },
  ]);

  const lessonCountMap = new Map<string, number>();
  lessonCounts.forEach((lc: any) => {
    lessonCountMap.set(lc._id.toString(), lc.count);
  });

  // Progress documents
  const progressDocs = await Progress.find({
    studentId: req.user._id,
    courseId: { $in: courseIds },
  }).select('courseId overallProgress completedAssessments averageScore lastAccessedAt');

  const progressMap = new Map<string, any>();
  progressDocs.forEach((p) => {
    if (p.courseId) progressMap.set(p.courseId.toString(), p);
  });

  // Enrollment coursesProgress for lessonsCompleted and status
  const enrollmentProgressMap = new Map<string, any>();
  (enrollment.coursesProgress || []).forEach((cp: any) => {
    enrollmentProgressMap.set(cp.courseId.toString(), cp);
  });

  const coursesWithProgress = programCourses.map((course: any) => {
    const courseIdStr = course._id.toString();
    const courseProgressData = enrollmentProgressMap.get(courseIdStr);
    const progress = progressMap.get(courseIdStr);

    return {
      course: course.toObject(),
      enrollmentStatus: courseProgressData?.status || EnrollmentStatus.PENDING,
      lessonsCompleted: courseProgressData?.lessonsCompleted || 0,
      totalLessons: lessonCountMap.get(courseIdStr) || 0,
      progress: progress
        ? {
            overallProgress: progress.overallProgress,
            completedAssessments: progress.completedAssessments,
            averageScore: progress.averageScore,
            lastAccessedAt: progress.lastAccessedAt,
          }
        : null,
    };
  });

  return res.status(200).json({
    success: true,
    data: { program, courses: coursesWithProgress },
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
    .populate('programId', 'title');

  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  const modules = await Module.find({
    courseId,
    isPublished: true
  }).sort({ order: 1 });

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: courseId
  });

  // Map progress to modules
  const modulesWithProgress = modules.map((module: any) => {
    const moduleProgress = progress?.modules.find(
      (m: any) => m.moduleId.toString() === module._id.toString()
    );

    return {
      module: module.toObject(),
      progress: moduleProgress ? {
        completionPercentage: moduleProgress.completionPercentage,
        completedLessons: moduleProgress.lessons.filter((l: any) => l.status === 'completed').length,
        totalLessons: moduleProgress.lessons.length,
        completedAssessments: moduleProgress.assessments.filter((a: any) => a.status === 'completed').length,
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
    .populate('courseId', 'title programId');

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const lessons = await Lesson.find({
    moduleId,
    isPublished: true
  }).sort({ order: 1 });

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: (module.courseId as any)._id || module.courseId
  });

  let lessonProgressMap: Record<string, ILessonProgress> = {};
  if (progress) {
    const moduleProgress = progress.modules.find(
      (m: any) => m.moduleId.toString() === moduleId
    );
    if (moduleProgress) {
      moduleProgress.lessons.forEach((l: any) => {
        lessonProgressMap[l.lessonId.toString()] = l;
      });
    }
  }

  const lessonsWithProgress = lessons.map((lesson: any) => ({
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
  const { lessonId } = req.params;

  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Find the lesson
  const lesson = await Lesson.findById(lessonId)
    .populate({
      path: 'moduleId',
      populate: {
        path: 'courseId',
        select: 'title description thumbnail programId'
      }
    });

  if (!lesson) {
    return res.status(404).json({ success: false, error: "Lesson not found" });
  }

  const module: any = lesson.moduleId;
  const courseId = module.courseId?._id || module.courseId;
  const programId = module.courseId?.programId || undefined;

  // For students, verify enrollment (course in program enrollment)
// ✅ AFTER — checks program-level enrollment, which is how your system actually works
if (req.user.role === UserRole.STUDENT) {
  if (!programId) {
    return res.status(400).json({ success: false, error: "Course is not linked to a program" });
  }

  const enrollment = await Enrollment.findOne({
    studentId: req.user._id,
    programId: programId,
    status: { $in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
  });

  if (!enrollment) {
    return res.status(403).json({ success: false, error: "Not enrolled in this course" });
  }
  }

  // Fetch assessments for this lesson
  const assessmentFilter: any = { lessonId: lesson._id };

  // Only show published assessments to students
  if (req.user.role === UserRole.STUDENT) {
    assessmentFilter.isPublished = true;
  }

  const assessments = await Assessment.find(assessmentFilter)
    .select('_id title description type passingScore duration order endDate totalPoints')
    .sort({ order: 1 });

  // For students, fetch their submission status for each assessment
  let assessmentsWithStatus = assessments.map(a => a.toObject());

  if (req.user.role === UserRole.STUDENT) {
    const assessmentIds = assessments.map(a => a._id);

    const submissions = await Submission.find({
      assessmentId: { $in: assessmentIds },
      studentId: req.user._id,
      status: { $ne: 'draft' }
    })
      .sort({ attemptNumber: -1 })
      .select('assessmentId status score percentage attemptNumber submittedAt gradedAt feedback');

    const submissionMap = new Map<string, any>();
    submissions.forEach(sub => {
      const assessmentIdStr = sub.assessmentId.toString();
      if (!submissionMap.has(assessmentIdStr)) {
        submissionMap.set(assessmentIdStr, sub);
      }
    });

    assessmentsWithStatus = assessments.map(assessment => {
      const assessmentObj = assessment.toObject();
      const submission = submissionMap.get(assessment._id.toString());

      return {
        ...assessmentObj,
        submission: submission ? {
          _id: submission._id,
          status: submission.status,
          score: submission.score,
          percentage: submission.percentage,
          attemptNumber: submission.attemptNumber,
          submittedAt: submission.submittedAt,
          gradedAt: submission.gradedAt,
          feedback: submission.feedback
        } : null
      } as any;
    });
  }

  // Get previous and next lessons for navigation
  const allLessons = await Lesson.find({
    moduleId: module._id,
    isPublished: true
  })
    .sort({ order: 1 })
    .select('_id title order');

  const currentIndex = allLessons.findIndex(l => l._id.toString() === lessonId);
  const previousLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  // Get student progress from course-level Progress document
  let lessonProgress: any = {
    status: 'not_started',
    timeSpent: 0
  };

  if (req.user.role === UserRole.STUDENT) {
    const progressDoc = await Progress.findOne({
      studentId: req.user._id,
      courseId: courseId,
      programId: programId
    });

    if (progressDoc) {
      const moduleProgress = progressDoc.modules.find(
        (m: any) => m.moduleId.toString() === module._id.toString()
      );

      if (moduleProgress) {
        const lessonProg = moduleProgress.lessons.find(
          (l: any) => l.lessonId.toString() === lessonId
        );

        if (lessonProg) {
          lessonProgress = {
            status: lessonProg.status || 'not_started',
            timeSpent: lessonProg.timeSpent || 0,
            startedAt: lessonProg.startedAt,
            completedAt: lessonProg.completedAt
          };
        }
      }
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      lesson,
      assessments: assessmentsWithStatus,
      navigation: {
        previous: previousLesson,
        next: nextLesson
      },
      progress: lessonProgress
    }
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
    .populate('courseId', 'title description programId')
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
  const lessonsCompleted = progressList.reduce((sum, p) => sum + (p.completedLessons || 0), 0);
  const assessmentsCompleted = progressList.reduce((sum, p) => sum + (p.completedAssessments || 0), 0);

  // Get completion trend (group by day)
  const dailyActivity = progressList.reduce((acc: Record<string, any>, p) => {
    if (p.lastAccessedAt) {
      const date = p.lastAccessedAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { lessons: 0, assessments: 0, time: 0 };
      }
      acc[date].lessons += p.completedLessons || 0;
      acc[date].assessments += p.completedAssessments || 0;
      acc[date].time += p.totalTimeSpent || 0;
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
      })).sort((a: any, b: any) => (a.date as string).localeCompare(b.date))
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

  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate({
      path: 'programId',
      select: 'title description slug coverImage estimatedHours'
    })
    .sort({ enrollmentDate: -1 });

  if (!enrollments.length) {
    return res.status(200).json({ success: true, count: 0, data: [] });
  }

  // ✅ Get ALL courses from DB for each enrolled program (not from stale coursesProgress)
  const programIds = enrollments.map((e: any) => e.programId._id || e.programId);

  const allCourses = await Course.find({ programId: { $in: programIds } })
    .select('title description order estimatedHours coverImage programId')
    .sort({ order: 1 });

  if (!allCourses.length) {
    return res.status(200).json({ success: true, count: 0, data: [] });
  }

  const courseIds = allCourses.map((c: any) => c._id);

  // ✅ Live lesson counts via aggregation
  const moduleDocs = await Module.find({ courseId: { $in: courseIds } }).select('_id courseId');
  const moduleIds = moduleDocs.map((m: any) => m._id);

  const lessonCounts = await Lesson.aggregate([
    { $match: { moduleId: { $in: moduleIds } } },
    {
      $lookup: {
        from: 'modules',
        localField: 'moduleId',
        foreignField: '_id',
        as: 'mod',
      },
    },
    { $unwind: '$mod' },
    { $group: { _id: '$mod.courseId', count: { $sum: 1 } } },
  ]);

  const lessonCountMap = new Map<string, number>();
  lessonCounts.forEach((lc: any) => {
    lessonCountMap.set(lc._id.toString(), lc.count);
  });

  // ✅ Build enrollment progress map from coursesProgress (for lessonsCompleted + status)
  const enrollmentProgressMap = new Map<string, any>();
  enrollments.forEach((enrollment: any) => {
    (enrollment.coursesProgress || []).forEach((cp: any) => {
      enrollmentProgressMap.set(cp.courseId.toString(), cp);
    });
  });

  // ✅ Build program map for easy lookup
  const programMap = new Map<string, any>();
  enrollments.forEach((enrollment: any) => {
    const program = enrollment.programId as any;
    if (program?._id) {
      programMap.set(program._id.toString(), program);
    }
  });

  // ✅ Fetch all progress docs in one query
  const progressDocs = await Progress.find({
    studentId: req.user._id,
    courseId: { $in: courseIds },
  }).select('courseId overallProgress completedAssessments averageScore lastAccessedAt completedLessons');

  const progressMap = new Map<string, any>();
  progressDocs.forEach((p) => {
    if (p.courseId) progressMap.set(p.courseId.toString(), p);
  });

  const coursesWithProgress = allCourses.map((course: any) => {
    const courseIdStr = course._id.toString();
    const programIdStr = course.programId?.toString();
    const program = programMap.get(programIdStr);
    const cpData = enrollmentProgressMap.get(courseIdStr);
    const progress = progressMap.get(courseIdStr);

    return {
      course: course.toObject(),
      program: program
        ? { _id: program._id, title: program.title }
        : null,
      enrollmentStatus: cpData?.status || EnrollmentStatus.PENDING,
      lessonsCompleted: progress?.completedLessons || cpData?.lessonsCompleted || 0,
      totalLessons: lessonCountMap.get(courseIdStr) || 0, // ✅ live count
      progress: progress
        ? {
            overallProgress: progress.overallProgress,
            completedAssessments: progress.completedAssessments,
            averageScore: progress.averageScore,
            lastAccessedAt: progress.lastAccessedAt,
          }
        : null,
    };
  });

  return res.status(200).json({
    success: true,
    count: coursesWithProgress.length,
    data: coursesWithProgress,
  });
});