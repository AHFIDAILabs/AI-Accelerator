// ============================================
// src/controllers/instructor.controller.ts
// ============================================

import { Response } from 'express';
import fs from 'fs/promises';
import mongoose from 'mongoose';
import { User, UserRole, UserStatus } from '../models/user';
import { Course } from '../models/Course';
import { Module } from '../models/Module';
import { Enrollment } from '../models/Enrollment';
import { Progress } from '../models/ProgressTrack';
import { Submission, SubmissionStatus } from '../models/Submission';
import { AuthRequest } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { QueryHelper } from '../utils/queryHelper';
import { pushNotification, NotificationTemplates } from '../utils/pushNotification';
import { NotificationType } from '../models/Notification';
import { CloudinaryHelper } from '../utils/cloudinaryHelper';
import { chunkArray } from '../utils/chunkArray';


// ============================================
// INSTRUCTOR PROFILE
// ============================================

// @desc    Get instructor's own profile
// @route   GET /api/v1/instructors/me
// @access  Instructor only
export const getInstructorProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authorized' });

  const instructor = await User.findById(req.user._id)
    .select('-password -refreshTokens -accessToken')
    .populate('instructorProfile.coursesTaught', 'title description');

  if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
    return res.status(403).json({ success: false, error: 'Instructor role required' });
  }

  const courseIds = instructor.instructorProfile?.coursesTaught || [];

  const [totalCourses, totalStudents, pendingSubmissions] = await Promise.all([
    Course.countDocuments({ instructor: instructor._id }),
    Enrollment.countDocuments({ courseId: { $in: courseIds } }),
    Submission.countDocuments({ instructorId: instructor._id, status: SubmissionStatus.SUBMITTED })
  ]);

 return res.status(200).json({
    success: true,
    data: { instructor, stats: { totalCourses, totalStudents, pendingSubmissions } }
  });
});


// @desc    Update instructor profile (handles text fields, image upload, and image deletion)
// @route   PUT /api/v1/instructors/me
// @access  Instructor only
export const updateInstructorProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authorized' });

const instructor = await User.findById(req.user._id).select('-password -refreshTokens -accessToken');
  if (!instructor || instructor.role !== UserRole.INSTRUCTOR)
    return res.status(403).json({ success: false, error: 'Access denied' });

  const { bio, linkedinProfile, phoneNumber, firstName, lastName, deleteProfileImage } = req.body;

  if (firstName?.trim()) instructor.firstName = firstName.trim();
  if (lastName?.trim()) instructor.lastName = lastName.trim();
  if (phoneNumber !== undefined) instructor.phoneNumber = phoneNumber.trim();

  instructor.instructorProfile ??= { bio: '', linkedinProfile: '', coursesTaught: [] };
  if (bio !== undefined) instructor.instructorProfile.bio = bio.trim();
  if (linkedinProfile !== undefined) instructor.instructorProfile.linkedinProfile = linkedinProfile.trim();

  try {
    if (deleteProfileImage === 'true' || deleteProfileImage === true) {
      if (instructor.profileImage && instructor.profileImage !== 'default-avatar.png') {
        const publicId = CloudinaryHelper.extractPublicId(instructor.profileImage);
        if (publicId) await CloudinaryHelper.deleteFile(publicId);
      }
      instructor.profileImage = 'default-avatar.png';
    } else if (req.file) {
      if (instructor.profileImage && instructor.profileImage !== 'default-avatar.png') {
        const oldId = CloudinaryHelper.extractPublicId(instructor.profileImage);
        if (oldId) await CloudinaryHelper.deleteFile(oldId);
      }

      const upload = await CloudinaryHelper.uploadFile(req.file.path, 'image', 'instructors/profiles');
      instructor.profileImage = upload.secure_url;

      await fs.unlink(req.file.path).catch(() => {});
    }
  } catch {
    return res.status(500).json({ success: false, error: 'Image operation failed' });
  }

  await instructor.save();

return res.status(200).json({
  success: true,
  message: 'Profile updated',
  data: instructor,
});
});


// ============================================
// COURSE MANAGEMENT
// ============================================


// @desc    Create a new course by instructor
// @route   POST /api/v1/instructors/courses
// @access  Instructor only
export const createInstructorCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const instructor = await User.findById(req.user._id);
    if (!instructor || instructor.role !== UserRole.INSTRUCTOR) {
      return res.status(403).json({ success: false, error: 'Instructor role required' });
    }

    const {
      title,
      description,
      slug,
      program,
      targetAudience,
      estimatedHours,
      order,
      objectives,
      prerequisites,
    } = req.body;

    if (!title || !description || !program || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Title, description, slug, and program are required',
      });
    }

    // Parse JSON fields safely (FormData sends strings)
    const parsedObjectives =
      typeof objectives === 'string' ? JSON.parse(objectives) : objectives || [];

    const parsedPrerequisites =
      typeof prerequisites === 'string' ? JSON.parse(prerequisites) : prerequisites || [];

    let coverImage: string | undefined;

    // Handle cover image upload
    if (req.file) {
      const upload = await CloudinaryHelper.uploadFile(
        req.file.path,
        'image',
        'courses/covers'
      );

      coverImage = upload.secure_url;

      // Remove temp file
      await fs.unlink(req.file.path).catch(() => {});
    }

    const course = await Course.create({
      title: title.trim(),
      description: description.trim(),
      slug: slug.trim(),
      program,
      targetAudience: targetAudience?.trim(),
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      order: order ? Number(order) : 1,
      objectives: parsedObjectives,
      prerequisites: parsedPrerequisites,
      coverImage,
      instructor: req.user._id,
      createdBy: req.user._id,
      approvalStatus: 'pending',
      isPublished: false,
    });

    // Attach course to instructor profile
    instructor.instructorProfile ??= { bio: '', linkedinProfile: '', coursesTaught: [] };
    instructor.instructorProfile.coursesTaught?.push(course._id);
    await instructor.save();

    return res.status(201).json({
      success: true,
      message: 'Course created successfully and pending approval',
      data: course,
    });
  }
);


// @desc    Get all courses taught by instructor
// @route   GET /api/v1/instructors/courses
// @access  Instructor only
export const getInstructorCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const baseFilter: any = { instructor: req.user._id };
  if (req.query.isPublished !== undefined) baseFilter.isPublished = req.query.isPublished === 'true';

  let query = Course.find(baseFilter).populate('program', 'title');

  const helper = new QueryHelper(query, req.query)
    .search(['title', 'description'])
    .sort();

  const { page, limit } = helper.paginate();
  const courses = await helper.query;
  const total = await Course.countDocuments(baseFilter);

 return res.json({ success: true, count: courses.length, total, page, pages: Math.ceil(total / limit), data: courses });
});


// @desc    Get single course details
// @route   GET /api/v1/instructors/courses/:id
// @access  Instructor only
export const getInstructorCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const course = await Course.findOne({
      _id: req.params.id,
      instructor: req.user._id
    }).populate('program', 'title');

    if (!course) {
      return res.status(404).json({ 
        success: false, 
        error: 'Course not found or access denied' 
      });
    }

    // Get modules for this course
    const modules = await Module.find({ courseId: course._id })
      .sort({ weekNumber: 1 });

    // Get enrollment stats
    const enrollmentStats = await Enrollment.aggregate([
      { $match: { courseId: course._id } },
      { 
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

   return res.status(200).json({
      success: true,
      data: {
        course,
        modules,
        enrollmentStats
      }
    });
  }
);

// ============================================
// STUDENT MANAGEMENT
// ============================================

// @desc    Get students enrolled in instructor's courses
// @route   GET /api/v1/instructors/students
// @access  Instructor only
export const getInstructorStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const instructorCourses = await Course.find({ instructor: req.user._id }).select('_id');
  const courseIds = instructorCourses.map(c => c._id.toString());

  const { courseId, status } = req.query;

  if (courseId && !courseIds.includes(courseId as string))
    return res.status(403).json({ success: false, error: 'Access denied' });

  const filter: any = { courseId: courseId || { $in: courseIds } };
  if (status) filter.status = status;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

  const [enrollments, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('studentId', 'firstName lastName email profileImage')
      .populate('courseId', 'title')
      .skip((page - 1) * limit)
      .limit(limit),
    Enrollment.countDocuments(filter)
  ]);

 return res.json({ success: true, count: enrollments.length, total, page, pages: Math.ceil(total / limit), data: enrollments });
});


// @desc    Get student progress in a course
// @route   GET /api/v1/instructors/students/:studentId/courses/:courseId/progress
// @access  Instructor only
export const getStudentCourseProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const { studentId, courseId } = req.params;

    // Verify instructor teaches this course
    const course = await Course.findOne({
      _id: courseId,
      instructor: req.user._id
    });

    if (!course) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied or course not found' 
      });
    }

    // Get student progress
    const progress = await Progress.findOne({
      studentId,
      courseId
    }).populate('modules.moduleId', 'title weekNumber');

    if (!progress) {
      return res.status(404).json({ 
        success: false, 
        error: 'Progress not found' 
      });
    }

    // Get student info
    const student = await User.findById(studentId)
      .select('firstName lastName email profileImage');

    // Get submissions for this course
    const submissions = await Submission.find({
      studentId,
      courseId
    }).populate('assessmentId', 'title type');

   return res.status(200).json({
      success: true,
      data: {
        student,
        course: {
          id: course._id,
          title: course.title
        },
        progress,
        submissions
      }
    });
  }
);

// ============================================
// ASSESSMENT & GRADING
// ============================================

// @desc    Get pending submissions for grading
// @route   GET /api/v1/instructors/submissions/pending
// @access  Instructor only
export const getPendingSubmissions = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const { courseId, page = '1', limit = '10' } = req.query;

    const filter: any = { 
      instructorId: req.user._id,
      status: 'submitted'
    };

    if (courseId) {
      filter.courseId = courseId;
    }

    const submissions = await Submission.find(filter)
      .populate('studentId', 'firstName lastName email profileImage')
      .populate('assessmentId', 'title type maxScore')
      .populate('courseId', 'title')
      .sort({ submittedAt: 1 }) // Oldest first
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string));

    const total = await Submission.countDocuments(filter);

   return res.status(200).json({
      success: true,
      count: submissions.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: submissions
    });
  }
);

// @desc    Grade a submission
// @route   PUT /api/v1/instructors/submissions/:id/grade
// @access  Instructor only
export const gradeSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const numericScore = Number(req.body.score);
  if (isNaN(numericScore)) return res.status(400).json({ success: false, error: 'Invalid score' });

  const submission = await Submission.findOne({ _id: req.params.id, instructorId: req.user._id })
    .populate('assessmentId studentId');

  if (!submission) return res.status(404).json({ success: false });

  const assessment: any = submission.assessmentId;
  if (numericScore < 0 || numericScore > assessment.maxScore)
    return res.status(400).json({ success: false, error: `Score must be 0-${assessment.maxScore}` });

  submission.score = numericScore;
  submission.feedback = req.body.feedback;
  submission.status = SubmissionStatus.GRADED;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user._id;

  await submission.save();

  await Progress.findOneAndUpdate(
    { studentId: submission.studentId, courseId: submission.courseId },
    { $inc: { completedAssessments: 1 } },
    { upsert: true }
  );

  const student: any = submission.studentId;
  await pushNotification({
    userId: student._id,
    ...NotificationTemplates.assessmentGraded(assessment.title, numericScore),
    relatedId: assessment._id,
    relatedModel: 'Assessment'
  });

 return res.json({ success: true, message: 'Submission graded', data: submission });
});


// ============================================
// ANNOUNCEMENTS
// ============================================

// @desc    Send announcement to course students
// @route   POST /api/v1/instructors/courses/:courseId/announcements
// @access  Instructor only
export const sendCourseAnnouncement = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const course = await Course.findOne({ _id: req.params.courseId, instructor: req.user._id });
  if (!course) return res.status(403).json({ success: false });

  const enrollments = await Enrollment.find({ courseId: course._id, status: 'active' }).populate('studentId');

  const notifications = enrollments
    .filter(e => e.studentId)
    .map(e => ({
      userId: (e.studentId as any)._id,
      type: NotificationType.ANNOUNCEMENT,
      title: `${course.title}: ${req.body.title}`,
      message: req.body.message,
      relatedId: course._id,
      relatedModel: 'Course' as const
    }));

  for (const batch of chunkArray(notifications, 100)) {
    await Promise.all(batch.map(n => pushNotification(n)));
  }

 return res.json({ success: true, message: `Sent to ${notifications.length} students` });
});


// ============================================
// STATISTICS
// ============================================

// @desc    Get instructor dashboard statistics
// @route   GET /api/v1/instructors/dashboard/stats
// @access  Instructor only
export const getInstructorDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const courses = await Course.find({ instructor: req.user._id });
  const courseIds = courses.map(c => c._id);

  const [totalEnrollments, activeStudents, pendingSubmissions, gradedThisWeek, recentSubmissions] = await Promise.all([
    Enrollment.countDocuments({ courseId: { $in: courseIds } }),
    Enrollment.countDocuments({ courseId: { $in: courseIds }, status: 'active' }),
    Submission.countDocuments({ instructorId: req.user._id, status: SubmissionStatus.SUBMITTED }),
    Submission.countDocuments({
      instructorId: req.user._id,
      status: SubmissionStatus.GRADED,
      gradedAt: { $gte: new Date(Date.now() - 7 * 86400000) }
    }),
    Submission.find({ instructorId: req.user._id })
      .populate('studentId', 'firstName lastName')
      .populate('assessmentId', 'title')
      .sort({ submittedAt: -1 })
      .limit(5)
  ]);

 return res.json({
    success: true,
    data: {
      courses: { total: courses.length, published: courses.filter(c => c.isPublished).length },
      students: { totalEnrollments, active: activeStudents },
      assessments: { pendingSubmissions, gradedThisWeek },
      recentActivity: { submissions: recentSubmissions }
    }
  });
});
