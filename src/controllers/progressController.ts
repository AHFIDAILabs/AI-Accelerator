import { Request, Response } from "express";
import mongoose from "mongoose";
import { Progress } from "../models/ProgressTrack";
import { Lesson } from "../models/Lesson";
import { Module } from "../models/Module";
import { Assessment } from "../models/Assessment";
import { Course } from "../models/Course";
import { Enrollment } from "../models/Enrollment";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { pushNotification } from "../utils/pushNotification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { NotificationType } from "../models/Notification";

// ==============================
// START OR UPDATE LESSON PROGRESS
// ==============================
export const startLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const lesson = await Lesson.findById(req.params.lessonId).populate('moduleId');
  if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

  const module = await Module.findById(lesson.moduleId);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  let progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: module.courseId 
  });

  if (!progress) {
    progress = await Progress.create({
      studentId: req.user._id,
      courseId: module.courseId,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons: 0,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
    });
  }

  let moduleProgress = progress.modules.find(m => m.moduleId.toString() === lesson.moduleId.toString());
  if (!moduleProgress) {
    moduleProgress = { 
      moduleId: lesson.moduleId, 
      lessons: [], 
      assessments: [], 
      completionPercentage: 0 
    };
    progress.modules.push(moduleProgress);
  }

  let lessonProgress = moduleProgress.lessons.find(l => l.lessonId.toString() === lesson._id.toString());
  if (!lessonProgress) {
    lessonProgress = { 
      lessonId: lesson._id, 
      status: "in_progress", 
      startedAt: new Date() 
    };
    moduleProgress.lessons.push(lessonProgress);
  } else if (lessonProgress.status === "not_started") {
    lessonProgress.status = "in_progress";
    lessonProgress.startedAt = new Date();
  }

  await progress.save();
  
  return res.status(200).json({ success: true, message: "Lesson started", data: progress });
});

// ==============================
// COMPLETE LESSON
// ==============================
export const completeLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const lesson = await Lesson.findById(req.params.lessonId).populate('moduleId');
  if (!lesson) return res.status(404).json({ success: false, error: "Lesson not found" });

  const module = await Module.findById(lesson.moduleId);
  if (!module) return res.status(404).json({ success: false, error: "Module not found" });

  let progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: module.courseId 
  });
  
  if (!progress) {
    return res.status(400).json({ success: false, error: "Progress not started for this lesson" });
  }

  let moduleProgress = progress.modules.find(m => m.moduleId.toString() === lesson.moduleId.toString());
  if (!moduleProgress) {
    return res.status(400).json({ success: false, error: "Module progress not found" });
  }

  let lessonProgress = moduleProgress.lessons.find(l => l.lessonId.toString() === lesson._id.toString());
  if (!lessonProgress) {
    lessonProgress = { 
      lessonId: lesson._id, 
      status: "completed", 
      startedAt: new Date(), 
      completedAt: new Date() 
    };
    moduleProgress.lessons.push(lessonProgress);
  } else {
    lessonProgress.status = "completed";
    lessonProgress.completedAt = new Date();
  }

  // Update module completion percentage
  const totalLessons = await Lesson.countDocuments({ moduleId: lesson.moduleId });
  const completedLessons = moduleProgress.lessons.filter(l => l.status === "completed").length;
  moduleProgress.completionPercentage = Math.round((completedLessons / totalLessons) * 100);

  // Check if module is completed
  const isModuleCompleted = moduleProgress.completionPercentage === 100;

  // Update overall course progress
  const allModules = await Module.find({ courseId: module.courseId });
  const overallProgress = progress.modules.reduce((sum, m) => sum + m.completionPercentage, 0) / allModules.length || 0;
  progress.overallProgress = Math.round(overallProgress);

  // Update completed lessons count
  progress.completedLessons = completedLessons;
  progress.totalLessons = totalLessons;

  await progress.save();

  // Send notification for module completion
  if (isModuleCompleted) {
    try {
      const course = await Course.findById(module.courseId);
      
      await pushNotification({
        userId: req.user._id,
        type: NotificationType.COURSE_UPDATE,
        title: 'Module Completed! 🎉',
        message: `Congratulations! You've completed the module "${module.title}" in ${course?.title}`,
        relatedId: module._id,
        relatedModel: 'Module',
      });
    } catch (error) {
      console.error('Error sending module completion notification:', error);
    }
  }

  return res.status(200).json({ 
    success: true, 
    message: "Lesson completed", 
    data: progress,
    moduleCompleted: isModuleCompleted 
  });
});

// ==============================
// START ASSESSMENT
// ==============================
export const startAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const assessment = await Assessment.findById(req.params.assessmentId);
  if (!assessment || !assessment.isPublished) {
    return res.status(404).json({ success: false, error: "Assessment not found" });
  }

  let progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: assessment.courseId 
  });

  if (!progress) {
    progress = await Progress.create({
      studentId: req.user._id,
      courseId: assessment.courseId,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons: 0,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
    });
  }

  let moduleProgress = progress.modules.find(m => 
    m.moduleId?.toString() === assessment.moduleId?.toString()
  );

  if (!moduleProgress && assessment.moduleId) {
    moduleProgress = { 
      moduleId: assessment.moduleId, 
      lessons: [], 
      assessments: [], 
      completionPercentage: 0 
    };
    progress.modules.push(moduleProgress);
  }

  if (moduleProgress) {
    let assessmentProgress = moduleProgress.assessments.find(a => 
      a.assessmentId.toString() === assessment._id.toString()
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

  await progress.save();
  
  return res.status(200).json({ 
    success: true, 
    message: "Assessment started", 
    data: progress 
  });
});

// ==============================
// COMPLETE ASSESSMENT
// ==============================
export const completeAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { score } = req.body;
  
  if (score === undefined || score < 0 || score > 100) {
    return res.status(400).json({ 
      success: false, 
      error: "Valid score (0-100) is required" 
    });
  }

  const assessment = await Assessment.findById(req.params.assessmentId);
  if (!assessment || !assessment.isPublished) {
    return res.status(404).json({ success: false, error: "Assessment not found" });
  }

  let progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: assessment.courseId 
  });

  if (!progress) {
    return res.status(404).json({ success: false, error: "Progress not found" });
  }

  const moduleProgress = progress.modules.find(m => 
    m.moduleId?.toString() === assessment.moduleId?.toString()
  );

  if (!moduleProgress) {
    return res.status(404).json({ success: false, error: "Module progress not found" });
  }

  const assessmentProgress = moduleProgress.assessments.find(a => 
    a.assessmentId.toString() === assessment._id.toString()
  );

  if (!assessmentProgress) {
    return res.status(404).json({ success: false, error: "Assessment progress not found" });
  }

  assessmentProgress.status = "completed";
  assessmentProgress.completedAt = new Date();
  assessmentProgress.score = score;

  // Update module completion including assessments
  const completedLessons = moduleProgress.lessons.filter(l => l.status === "completed").length;
  const completedAssessments = moduleProgress.assessments.filter(a => a.status === "completed").length;
  const totalItems = moduleProgress.lessons.length + moduleProgress.assessments.length;
  
  if (totalItems > 0) {
    moduleProgress.completionPercentage = Math.round(
      ((completedLessons + completedAssessments) / totalItems) * 100
    );
  }

  // Update overall assessment stats
  const allCompletedAssessments = progress.modules.flatMap(m => 
    m.assessments.filter(a => a.status === "completed")
  );
  
  progress.completedAssessments = allCompletedAssessments.length;
  
  if (allCompletedAssessments.length > 0) {
    const totalScore = allCompletedAssessments.reduce((sum, a) => sum + (a.score || 0), 0);
    progress.averageScore = Math.round(totalScore / allCompletedAssessments.length);
  }

  await progress.save();

  // Send notification about assessment completion
  try {
    const course = await Course.findById(assessment.courseId);
    const isPassing = score >= (assessment.passingScore || 70);

    const notification = NotificationTemplates.assessmentGraded(
      assessment.title,
      score
    );

    await pushNotification({
      userId: req.user._id,
      type: notification.type,
      title: isPassing ? '✅ Assessment Passed!' : 'Assessment Completed',
      message: `${notification.message} ${isPassing ? 'Well done!' : 'Keep practicing!'}`,
      relatedId: assessment._id,
      relatedModel: 'Assessment',
    });

    // Check if course is completed
    const allModules = await Module.find({ courseId: assessment.courseId });
    const allModulesCompleted = allModules.every(module => {
      const modProgress = progress!.modules.find(m => 
        m.moduleId.toString() === module._id.toString()
      );
      return modProgress && modProgress.completionPercentage === 100;
    });

    if (allModulesCompleted) {
      // Update enrollment status
      await Enrollment.findOneAndUpdate(
        { studentId: req.user._id, courseId: assessment.courseId },
        { status: 'completed', completionDate: new Date() }
      );

      // Send course completion notification
      await pushNotification({
        userId: req.user._id,
        type: NotificationType.COURSE_UPDATE,
        title: '🎓 Course Completed!',
        message: `Congratulations! You've completed ${course?.title}. Your certificate will be issued soon.`,
        relatedId: assessment.courseId,
        relatedModel: 'Course',
      });
    }
  } catch (error) {
    console.error('Error sending assessment completion notification:', error);
  }

  return res.status(200).json({ 
    success: true, 
    message: "Assessment completed", 
    data: progress 
  });
});

// ==============================
// GET STUDENT PROGRESS FOR A COURSE
// ==============================
export const getCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: req.params.courseId 
  });

  if (!progress) {
    return res.status(404).json({ success: false, error: "Progress not found" });
  }

  return res.status(200).json({ success: true, data: progress });
});