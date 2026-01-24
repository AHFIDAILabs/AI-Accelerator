// ============================================
// src/controllers/progress.controller.ts
// ============================================

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Progress } from "../models/ProgressTrack";
import { Lesson } from "../models/Lesson";
import { Module } from "../models/Module";
import { Assessment } from "../models/Assessment";
import { Course } from "../models/Course";
import { Program } from "../models/program";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { pushNotification } from "../utils/pushNotification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { NotificationType } from "../models/Notification";

// ==============================
// GET STUDENT'S PROGRAM PROGRESS
// ==============================
export const getProgramProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
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
    select: 'title courses'
  });

  if (!enrollment) {
    res.status(404).json({ 
      success: false, 
      error: "Not enrolled in this program" 
    });
    return;
  }

  // Get progress for all courses in the program
  const courseProgress = await Progress.find({
    studentId: req.user._id,
    courseId: { $in: (enrollment.program as any).courses }
  }).populate('courseId', 'title order estimatedHours');

  // Calculate overall program statistics
  const totalProgress = courseProgress.reduce((sum, cp) => sum + cp.overallProgress, 0);
  const averageProgress = courseProgress.length > 0 
    ? totalProgress / courseProgress.length 
    : 0;

  const totalLessons = courseProgress.reduce((sum, cp) => sum + cp.totalLessons, 0);
  const completedLessons = courseProgress.reduce((sum, cp) => sum + cp.completedLessons, 0);

  const totalAssessments = courseProgress.reduce((sum, cp) => sum + cp.totalAssessments, 0);
  const completedAssessments = courseProgress.reduce((sum, cp) => sum + cp.completedAssessments, 0);

  const completedCourses = enrollment.coursesProgress.filter(
    cp => cp.status === EnrollmentStatus.COMPLETED
  ).length;

  res.status(200).json({
    success: true,
    data: {
      enrollment,
      courseProgress,
      overallStats: {
        averageProgress: Math.round(averageProgress),
        completedCourses,
        totalCourses: enrollment.coursesProgress.length,
        completedLessons,
        totalLessons,
        completedAssessments,
        totalAssessments,
      }
    }
  });
});

// ==============================
// GET STUDENT'S COURSE PROGRESS
// ==============================
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
  .populate('courseId', 'title description program estimatedHours')
  .populate('programId', 'title')
  .populate({
    path: 'modules.moduleId',
    select: 'title description order sequenceLabel type'
  })
  .populate({
    path: 'modules.lessons.lessonId',
    select: 'title type estimatedMinutes order'
  })
  .populate({
    path: 'modules.assessments.assessmentId',
    select: 'title type totalPoints passingScore'
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

// ==============================
// GET STUDENT'S MODULE PROGRESS
// ==============================
export const getModuleProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { moduleId } = req.params;

  const module = await Module.findById(moduleId);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: module.course
  });

  if (!progress) {
    res.status(404).json({
      success: false,
      error: "No progress found for this module's course"
    });
    return;
  }

  const moduleProgress = progress.modules.find(
    m => m.moduleId.toString() === moduleId
  );

  if (!moduleProgress) {
    res.status(404).json({
      success: false,
      error: "No progress data for this module"
    });
    return;
  }

  // Populate lesson and assessment details
  const populatedModule = await Progress.populate(moduleProgress, [
    { path: 'moduleId', select: 'title description order sequenceLabel' },
    { path: 'lessons.lessonId', select: 'title type estimatedMinutes order' },
    { path: 'assessments.assessmentId', select: 'title type totalPoints passingScore' }
  ]);

  res.status(200).json({ 
    success: true, 
    data: populatedModule 
  });
});

// ==============================
// START LESSON PROGRESS
// ==============================
export const startLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { lessonId } = req.params;

  const lesson = await Lesson.findById(lessonId);
  if (!lesson || !lesson.isPublished) {
    res.status(404).json({ success: false, error: "Lesson not found or not published" });
    return;
  }

  const module = await Module.findById(lesson.module);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const course = await Course.findById(module.course);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  let progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: module.course
  });

  if (!progress) {
    // Initialize progress if it doesn't exist
    const modules = await Module.find({ course: module.course });
    const moduleIds = modules.map(m => m._id);
    const totalLessons = await Lesson.countDocuments({ 
      module: { $in: moduleIds },
      isPublished: true
    });
    const totalAssessments = await Assessment.countDocuments({
      courseId: module.course,
      isPublished: true
    });

    progress = await Progress.create({
      studentId: req.user._id,
      courseId: module.course,
      programId: course.program,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons,
      completedAssessments: 0,
      totalAssessments,
      averageScore: 0,
      totalTimeSpent: 0,
    });
  }

  let moduleProgress = progress.modules.find(
    m => m.moduleId.toString() === lesson.module.toString()
  );

  if (!moduleProgress) {
    moduleProgress = {
      moduleId: lesson.module,
      lessons: [],
      assessments: [],
      completionPercentage: 0,
      startedAt: new Date()
    };
    progress.modules.push(moduleProgress);
  }

  let lessonProgress = moduleProgress.lessons.find(
    l => l.lessonId.toString() === lessonId
  );

  if (!lessonProgress) {
    lessonProgress = {
      lessonId: lesson._id,
      status: "in_progress",
      startedAt: new Date(),
      timeSpent: 0
    };
    moduleProgress.lessons.push(lessonProgress);
  } else if (lessonProgress.status === "not_started") {
    lessonProgress.status = "in_progress";
    lessonProgress.startedAt = new Date();
  }

  progress.lastAccessedAt = new Date();
  await progress.save();

  res.status(200).json({
    success: true,
    message: "Lesson started",
    data: progress
  });
});

// ==============================
// COMPLETE LESSON PROGRESS
// ==============================
export const completeLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { lessonId } = req.params;
  const { timeSpent = 0 } = req.body;

  const lesson = await Lesson.findById(lessonId);
  if (!lesson || !lesson.isPublished) {
    res.status(404).json({ success: false, error: "Lesson not found or not published" });
    return;
  }

  const module = await Module.findById(lesson.module);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const course = await Course.findById(module.course);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  let progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: module.course
  });

  if (!progress) {
    res.status(400).json({
      success: false,
      error: "Progress not started for this lesson. Please start the lesson first."
    });
    return;
  }

  let moduleProgress = progress.modules.find(
    m => m.moduleId.toString() === lesson.module.toString()
  );

  if (!moduleProgress) {
    res.status(400).json({
      success: false,
      error: "Module progress not found"
    });
    return;
  }

  let lessonProgress = moduleProgress.lessons.find(
    l => l.lessonId.toString() === lessonId
  );

  if (!lessonProgress) {
    lessonProgress = {
      lessonId: lesson._id,
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      timeSpent
    };
    moduleProgress.lessons.push(lessonProgress);
  } else {
    lessonProgress.status = "completed";
    lessonProgress.completedAt = new Date();
    lessonProgress.timeSpent = (lessonProgress.timeSpent || 0) + timeSpent;
  }

  // Update module completion percentage
  const moduleLessons = await Lesson.countDocuments({ 
    module: lesson.module,
    isPublished: true
  });
  const completedInModule = moduleProgress.lessons.filter(
    l => l.status === "completed"
  ).length;
  moduleProgress.completionPercentage = Math.round(
    (completedInModule / moduleLessons) * 100
  );

  if (moduleProgress.completionPercentage === 100 && !moduleProgress.completedAt) {
    moduleProgress.completedAt = new Date();
  }

  // Update overall course progress
  const totalCompletedLessons = progress.modules.reduce(
    (sum, m) => sum + m.lessons.filter(l => l.status === "completed").length,
    0
  );

  progress.completedLessons = totalCompletedLessons;
  progress.overallProgress = progress.totalLessons > 0
    ? Math.round((totalCompletedLessons / progress.totalLessons) * 100)
    : 0;

  progress.totalTimeSpent += timeSpent / 60; // Convert minutes to hours
  progress.lastAccessedAt = new Date();

  await progress.save();

  // Update enrollment progress
  await updateEnrollmentProgress(req.user._id, course.program, course._id);

  // Send module completion notification
  if (moduleProgress.completionPercentage === 100 && completedInModule === moduleLessons) {
    try {
      await pushNotification({
        userId: req.user._id,
        type: NotificationType.COURSE_UPDATE,
        title: "Module Completed! 🎉",
        message: `Congratulations! You've completed ${module.title}`,
        relatedId: module._id,
        relatedModel: "Module",
      });
    } catch (error) {
      console.error('Error sending module completion notification:', error);
    }
  }

  res.status(200).json({
    success: true,
    message: "Lesson completed",
    data: progress,
    moduleCompleted: moduleProgress.completionPercentage === 100
  });
});

// ==============================
// START ASSESSMENT PROGRESS
// ==============================
export const startAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { assessmentId } = req.params;

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment || !assessment.isPublished) {
    res.status(404).json({ 
      success: false, 
      error: "Assessment not found or not published" 
    });
    return;
  }

  let progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: assessment.courseId
  });

  if (!progress) {
    const course = await Course.findById(assessment.courseId);
    const modules = await Module.find({ course: assessment.courseId });
    const moduleIds = modules.map(m => m._id);
    const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });
    const totalAssessments = await Assessment.countDocuments({ courseId: assessment.courseId });

    progress = await Progress.create({
      studentId: req.user._id,
      courseId: assessment.courseId,
      programId: course?.program,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons,
      completedAssessments: 0,
      totalAssessments,
      averageScore: 0,
      totalTimeSpent: 0,
    });
  }

  if (assessment.moduleId) {
    let moduleProgress = progress.modules.find(
      m => m.moduleId?.toString() === assessment.moduleId?.toString()
    );

    if (!moduleProgress) {
      moduleProgress = {
        moduleId: assessment.moduleId,
        lessons: [],
        assessments: [],
        completionPercentage: 0,
        startedAt: new Date()
      };
      progress.modules.push(moduleProgress);
    }

    let assessmentProgress = moduleProgress.assessments.find(
      a => a.assessmentId.toString() === assessmentId
    );

    if (!assessmentProgress) {
      moduleProgress.assessments.push({
        assessmentId: assessment._id,
        status: "in_progress",
        startedAt: new Date(),
        attempts: 1
      });
    } else {
      assessmentProgress.status = "in_progress";
      assessmentProgress.attempts = (assessmentProgress.attempts || 0) + 1;
    }
  }

  progress.lastAccessedAt = new Date();
  await progress.save();

  res.status(200).json({
    success: true,
    message: "Assessment started",
    data: progress
  });
});

// ==============================
// COMPLETE ASSESSMENT PROGRESS
// ==============================
export const completeAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { assessmentId } = req.params;
  const { score } = req.body;

  if (score === undefined || score < 0 || score > 100) {
    res.status(400).json({
      success: false,
      error: "Valid score (0-100) is required"
    });
    return;
  }

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment || !assessment.isPublished) {
    res.status(404).json({ 
      success: false, 
      error: "Assessment not found" 
    });
    return;
  }

  let progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: assessment.courseId
  });

  if (!progress) {
    res.status(404).json({ 
      success: false, 
      error: "Progress not found. Please start the assessment first." 
    });
    return;
  }

  if (assessment.moduleId) {
    const moduleProgress = progress.modules.find(
      m => m.moduleId?.toString() === assessment.moduleId?.toString()
    );

    if (!moduleProgress) {
      res.status(404).json({ 
        success: false, 
        error: "Module progress not found" 
      });
      return;
    }

    const assessmentProgress = moduleProgress.assessments.find(
      a => a.assessmentId.toString() === assessmentId
    );

    if (!assessmentProgress) {
      res.status(404).json({ 
        success: false, 
        error: "Assessment progress not found" 
      });
      return;
    }

    assessmentProgress.status = "completed";
    assessmentProgress.completedAt = new Date();
    assessmentProgress.score = score;

    // Update module completion including assessments
    const completedLessons = moduleProgress.lessons.filter(
      l => l.status === "completed"
    ).length;
    const completedAssessments = moduleProgress.assessments.filter(
      a => a.status === "completed"
    ).length;
    const totalItems = moduleProgress.lessons.length + moduleProgress.assessments.length;

    if (totalItems > 0) {
      moduleProgress.completionPercentage = Math.round(
        ((completedLessons + completedAssessments) / totalItems) * 100
      );
    }

    if (moduleProgress.completionPercentage === 100 && !moduleProgress.completedAt) {
      moduleProgress.completedAt = new Date();
    }
  }

  // Update overall assessment stats
  const allCompletedAssessments = progress.modules.flatMap(
    m => m.assessments.filter(a => a.status === "completed")
  );

  progress.completedAssessments = allCompletedAssessments.length;

  if (allCompletedAssessments.length > 0) {
    const totalScore = allCompletedAssessments.reduce(
      (sum, a) => sum + (a.score || 0), 
      0
    );
    progress.averageScore = Math.round(totalScore / allCompletedAssessments.length);
  }

  progress.lastAccessedAt = new Date();
  await progress.save();

  // Check for course completion
  const course = await Course.findById(assessment.courseId);
  if (course) {
    await updateEnrollmentProgress(req.user._id, course.program, course._id);
  }

  // Send assessment completion notification
  try {
    const isPassing = score >= (assessment.passingScore || 70);
    const notification = NotificationTemplates.assessmentGraded(assessment.title, score);

    await pushNotification({
      userId: req.user._id,
      type: notification.type,
      title: isPassing ? '✅ Assessment Passed!' : 'Assessment Completed',
      message: `${notification.message} ${isPassing ? 'Well done!' : 'Keep practicing!'}`,
      relatedId: assessment._id,
      relatedModel: 'Assessment',
    });
  } catch (error) {
    console.error('Error sending assessment completion notification:', error);
  }

  res.status(200).json({
    success: true,
    message: "Assessment completed",
    data: progress
  });
});

// ==============================
// HELPER: Update Enrollment Progress
// ==============================
async function updateEnrollmentProgress(
  studentId: mongoose.Types.ObjectId,
  programId: mongoose.Types.ObjectId,
  courseId: mongoose.Types.ObjectId
) {
  try {
    const enrollment = await Enrollment.findOne({ 
      studentId, 
      program: programId 
    });
    
    if (!enrollment) return;

    const courseProgressIndex = enrollment.coursesProgress.findIndex(
      cp => cp.course.toString() === courseId.toString()
    );

    if (courseProgressIndex === -1) return;

    const progress = await Progress.findOne({ studentId, courseId });
    if (!progress) return;

    enrollment.coursesProgress[courseProgressIndex].lessonsCompleted = progress.completedLessons;

    if (enrollment.coursesProgress[courseProgressIndex].status === EnrollmentStatus.PENDING &&
        progress.completedLessons > 0) {
      enrollment.coursesProgress[courseProgressIndex].status = EnrollmentStatus.ACTIVE;
    }

    if (progress.overallProgress === 100 &&
        enrollment.coursesProgress[courseProgressIndex].status !== EnrollmentStatus.COMPLETED) {
      enrollment.coursesProgress[courseProgressIndex].status = EnrollmentStatus.COMPLETED;
      enrollment.coursesProgress[courseProgressIndex].completionDate = new Date();

      const course = await Course.findById(courseId).select('title');
      if (course) {
        await pushNotification({
          userId: studentId,
          type: NotificationType.COURSE_UPDATE,
          title: "Course Completed!",
          message: `Congratulations! You've completed ${course.title}`,
          relatedId: courseId,
          relatedModel: "Course",
        });
      }
    }

    await enrollment.save();

    const allCoursesCompleted = enrollment.coursesProgress.every(
      cp => cp.status === EnrollmentStatus.COMPLETED
    );

    if (allCoursesCompleted && enrollment.status !== EnrollmentStatus.COMPLETED) {
      enrollment.status = EnrollmentStatus.COMPLETED;
      enrollment.completionDate = new Date();
      await enrollment.save();

      const program = await Program.findById(programId).select('title');
      if (program) {
        await pushNotification({
          userId: studentId,
          type: NotificationType.CERTIFICATE_ISSUED,
          title: "Program Completed!",
          message: `Congratulations! You've completed the ${program.title} program`,
          relatedId: programId,
          relatedModel: "Course",
        });
      }
    }
  } catch (error) {
    console.error('Error updating enrollment progress:', error);
  }
}