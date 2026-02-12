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
import { Lesson } from '../models/Lesson';
import { Assessment } from '../models/Assessment';


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
    return res.status(200).json({
  success: true,
  message: 'Profile updated',
  data: instructor,
});
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

    // ✅ FIX: Use 'course' field, not 'courseId'
    const modules = await Module.find({ course: course._id })
      .populate('lessons') // Populate the lessons array
      .sort({ order: 1 }); // ✅ FIX: Sort by order, not weekNumber

    // ✅ Calculate stats for each module
    const modulesWithStats = modules.map(module => {
      const moduleObj = module.toObject();
      return {
        ...moduleObj,
        stats: {
          lessonCount: moduleObj.lessons?.length || 0,
          totalMinutes: moduleObj.lessons?.reduce((sum: number, lesson: any) => 
            sum + (lesson.estimatedMinutes || 0), 0) || 0
        }
      };
    });

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
        modules: modulesWithStats,
        enrollmentStats
      }
    });
  }
);

// ============================================
// STUDENT MANAGEMENT
// ============================================

// @desc    Get students enrolled in instructor's courses (via programs)
// @route   GET /api/v1/instructors/students
// @access  Instructor only
export const getInstructorStudents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ success: false });
    }

    const instructorId = req.user._id;
    const { page = 1, limit = 10, status } = req.query;

    // 1️⃣ Get all courses taught by instructor
    const courses = await Course.find({ instructor: instructorId })
      .select("_id title program");

    if (!courses.length) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        count: 0,
        page,
        pages: 1
      });
    }

    const programMap: Record<string, { id: string; title: string }[]> = {};
    courses.forEach((c) => {
      const pid = c.program.toString();
      if (!programMap[pid]) programMap[pid] = [];
      programMap[pid].push({ id: c._id.toString(), title: c.title });
    });

    const programIds = Object.keys(programMap).map(p => new mongoose.Types.ObjectId(p));

    // 2️⃣ Match students
    const match: any = { program: { $in: programIds } };
    if (status && status !== 'all') match.status = status;

    const total = await Enrollment.countDocuments(match);

    const students = await Enrollment.aggregate([
      { $match: match },
      { $sort: { enrollmentDate: -1 } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" },
      {
        $project: {
          _id: "$student._id",
          firstName: "$student.firstName",
          lastName: "$student.lastName",
          email: "$student.email",
          profileImage: "$student.profileImage",
          studentProfile: "$student.studentProfile",
          enrollmentDate: 1,
          UserStatus: "$student.UserStatus.ACTIVE",
          status: 1,
          program: 1
        }
      }
    ]);

    // 3️⃣ Attach courses & progress
    const studentIds = students.map(s => s._id);

    const progressDocs = await Progress.find({
      studentId: { $in: studentIds },
      courseId: { $in: courses.map(c => c._id) }
    }).select(
      "studentId overallProgress completedLessons totalLessons lastAccessedAt"
    );

    const progressMap = new Map();
    progressDocs.forEach((p) => {
      progressMap.set(p.studentId.toString(), p);
    });

    const result = students.map((s) => {
      const studentCourses = programMap[s.program.toString()] || [];
      const prog = progressMap.get(s._id.toString());

      return {
        ...s,
        courses: studentCourses,
        progress: prog
          ? {
              overallProgress: prog.overallProgress,
              completedLessons: prog.completedLessons,
              totalLessons: prog.totalLessons,
              lastAccessedAt: prog.lastAccessedAt,
            }
          : {
              overallProgress: 0,
              completedLessons: 0,
              totalLessons: 0,
              lastAccessedAt: null
            }
      };
    });

    return res.json({
      success: true,
      data: result,
      count: result.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  }
);

// @desc    Get student progress in a course
// @route   GET /api/v1/instructors/students/:studentId/courses/:courseId/progress
// @access  Instructor only

export const getStudentCourseProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { studentId, courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(studentId) ||
        !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Student or Course ID"
      });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authorized" });
    }

    // === COURSE OWNERSHIP ===
    const course = await Course.findById(courseId)
      .select("_id title slug description instructor program");

    if (!course || !course.instructor.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    // === STUDENT ENROLLMENT ===
    const enrollment = await Enrollment.findOne({
      studentId,
      program: course.program
    }).select("status enrollmentDate updatedAt");

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        error: "Student is not enrolled in this program"
      });
    }

    // === STUDENT INFO ===
    const student = await User.findById(studentId)
      .select("firstName lastName email profileImage studentProfile");

    // === PROGRESS ===
    const progressDoc = await Progress.findOne({
      studentId,
      courseId
    }).lean();

    const progress = progressDoc || {
      overallProgress: 0,
      completedLessons: 0,
      totalLessons: 0,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
      lastAccessedAt: new Date(0),
      modules: []
    };

    // Convert hours → minutes for frontend
    const totalMinutes = Math.round((progress.totalTimeSpent || 0) * 60);

    const stats = {
      totalTimeSpent: totalMinutes,
      averageScore: progress.averageScore ?? 0,
      completionRate: progress.overallProgress ?? 0,
      lastActiveDate: progress.lastAccessedAt || enrollment.updatedAt || new Date(0),
      streak: 0
    };

    // === MODULES + LESSONS ===
    const rawModules = await Module.find({ course: courseId })
      .populate("lessons", "title order estimatedMinutes")
      .sort({ order: 1 })
      .lean();

    const modules = rawModules.map((mod) => {
      const pMod = progress.modules?.find?.(
        (pm: any) => pm.moduleId.toString() === mod._id.toString()
      );

      return {
        _id: mod._id,
        title: mod.title,
        order: mod.order,
        lessons: (mod.lessons || []).map((lesson: any) => {
          const pLesson = pMod?.lessons?.find?.(
            (l: any) => l.lessonId.toString() === lesson._id.toString()
          );

          return {
            _id: lesson._id,
            title: lesson.title,
            order: lesson.order,
            duration: lesson.estimatedMinutes,
            isCompleted: pLesson?.status === "completed",
            completedAt: pLesson?.completedAt || null,
            lastAccessedAt: pLesson?.startedAt || null
          };
        })
      };
    });

    // === ASSESSMENTS (Submission + Assessment) ===
    const submissions = await Submission.find({
      studentId,
      courseId
    })
      .populate(
        "assessmentId",
        "title type description endDate totalPoints"
      )
      .lean();

    const assessments = submissions.map((s) => {
      const a: any = s.assessmentId; // populated doc OR ObjectId

      return {
        _id: a?._id || null,
        title: a?.title || "Unknown Assessment",
        type: a?.type,
        dueDate: a?.endDate || null,   // YOUR MODEL USES endDate, NOT dueDate
        submission: {
          _id: s._id,
          submittedAt: s.submittedAt,
          status: s.status,
          score: s.score,
          feedback: s.feedback
        }
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student?._id,
          firstName: student?.firstName,
          lastName: student?.lastName,
          email: student?.email,
          profileImage: student?.profileImage,
          enrollmentDate: enrollment.enrollmentDate,
          status: enrollment.status,
          studentProfile: student?.studentProfile
        },
        course: {
          _id: course._id,
          title: course.title,
          slug: course.slug,
          description: course.description
        },
        progress: {
          overallProgress: progress.overallProgress,
          completedLessons: progress.completedLessons,
          totalLessons: progress.totalLessons,
          lastAccessedAt: progress.lastAccessedAt,
          timeSpent: totalMinutes
        },
        modules,
        assessments,
        stats
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



// ==========================================
// GET INSTRUCTOR MODULES + COUNT
// ==========================================
export const getInstructorModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Find courses taught by instructor
  const courses = await Course.find({ instructor: req.user._id }).select("_id title program approvalStatus isPublished");

  const modules = await Module.find({
    course: { $in: courses.map((c) => c._id) }
  })
    .populate("course", "title program approvalStatus isPublished")
    .sort({ updatedAt: -1 });

  return res.status(200).json({
    success: true,
    count: modules.length,
    data: modules
  });
});


// ==========================================
// GET INSTRUCTOR LESSONS + COUNT
// ==========================================
export const getInstructorLessons = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Get instructor courses → then modules → then lessons
  const courses = await Course.find({ instructor: req.user._id }).select("_id title program approvalStatus isPublished");
  const modules = await Module.find({ course: { $in: courses.map(c => c._id) } }).select("_id title course");

  const lessons = await Lesson.find({
    module: { $in: modules.map((m) => m._id) }
  })
    .populate({
      path: "module",
      select: "title course ",
      populate: { path: "course", select: "title program approvalStatus isPublished" }
    })
    .sort({ updatedAt: -1 });

  return res.status(200).json({
    success: true,
    count: lessons.length,
    data: lessons
  });
});


// ==========================================
// GET INSTRUCTOR ASSESSMENTS + COUNT
// ==========================================
export const getInstructorAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const courses = await Course.find({ instructor: req.user._id }).select("_id title program approvalStatus isPublished");

  const assessments = await Assessment.find({
    courseId: { $in: courses.map(c => c._id) }
  })
    .populate("courseId", "title program approvalStatus isPublished")
    .sort({ updatedAt: -1 });

  return res.status(200).json({
    success: true,
    count: assessments.length,
    data: assessments
  });
});
