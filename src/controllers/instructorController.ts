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
import { pushNotification } from '../utils/pushNotification';
import {NotificationTemplates} from '../utils/notificationTemplates';
import { NotificationType } from '../models/Notification';
import { CloudinaryHelper } from '../utils/cloudinaryHelper';
import { chunkArray } from '../utils/chunkArray';
import { Lesson } from '../models/Lesson';
import { Assessment } from '../models/Assessment';
import { Program } from '../models/program';


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
    
    // Verify program exists
    const programExists = await Program.findById(program);
    if (!programExists) {
      return res.status(404).json({
        success: false,
        error: 'Program not found',
      });
    }

    // 🔧 ONE-TIME FIX: Repair this program's courses array if it's empty/incomplete
    try {
      const existingCoursesInProgram = programExists.courses || [];
      const allCoursesForProgram = await Course.find({ program: program }).select('_id');
      const allCourseIds = allCoursesForProgram.map(c => c._id.toString());
      const existingCourseIds = existingCoursesInProgram.map((id: any) => id.toString());
      
      // Find courses that exist in DB but not in program.courses array
      const missingCourses = allCourseIds.filter(id => !existingCourseIds.includes(id));
      
      if (missingCourses.length > 0) {
        console.log(`🔧 Fixing program "${programExists.title}": Adding ${missingCourses.length} missing courses`);
        await Program.findByIdAndUpdate(program, {
          $addToSet: { courses: { $each: missingCourses } }
        });
        console.log(`✅ Fixed program "${programExists.title}"`);
      }
    } catch (fixError) {
      console.error('⚠️ Error fixing program courses:', fixError);
      // Don't fail the request, just log the error
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
  programId: program,                // ✅ FIXED
  targetAudience: targetAudience?.trim(),
  estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
  order: order ? Number(order) : 1,
  objectives: parsedObjectives,
  prerequisites: parsedPrerequisites,
  coverImage,
  instructorId: req.user._id,        // ✅ FIXED
  createdBy: req.user._id,
  approvalStatus: 'pending',
  isPublished: false,
});
    
    // ✅ Add course to program's courses array
    await Program.findByIdAndUpdate(program, {
      $addToSet: { courses: course._id }
    });
    
    // Attach course to instructor profile
    instructor.instructorProfile ??= { bio: '', linkedinProfile: '', coursesTaught: [] };
    instructor.instructorProfile.coursesTaught?.push(course._id.toString());
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

  const baseFilter: any = { instructorId: req.user._id };   // ✅ FIXED

  if (req.query.isPublished !== undefined)
    baseFilter.isPublished = req.query.isPublished === 'true';

  let query = Course.find(baseFilter)
    .populate('programId', 'title createdBy createdAt coverImage');    // programId is correct

  const helper = new QueryHelper(query, req.query)
    .search(['title', 'description'])
    .sort();

  const { page, limit } = helper.paginate();
  const courses = await helper.query;
  const total = await Course.countDocuments(baseFilter);

  return res.json({
    success: true,
    count: courses.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: courses
  });
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
      instructorId: req.user._id      // ✅ FIXED
    })
    .populate('programId', 'title createdBy createdAt')  // programId is correct;

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found or access denied'
      });
    }

    // 🔥 FIX: Module schema uses courseId, not "course"
    const modules = await Module.find({ courseId: course._id })
      .populate('lessons')
      .sort({ order: 1 });

    const modulesWithStats = modules.map(module => {
      const obj = module.toObject();
      return {
        ...obj,
        stats: {
          lessonCount: obj.lessons?.length || 0,
          totalMinutes: obj.lessons?.reduce((sum: number, lesson: any) =>
            sum + (lesson.estimatedMinutes || 0), 0) || 0
        }
      };
    });

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
    const { page = 1, limit = 10, status, search } = req.query;

    // 1️⃣ Get all courses taught by this instructor
    const courses = await Course.find({ instructorId })
      .select("_id title programId");

    if (!courses.length) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        count: 0,
        page: Number(page),
        pages: 1,
      });
    }

    // Map: programId → courses array (for attaching to student result)
    const programMap: Record<string, { id: string; title: string }[]> = {};
    courses.forEach((c) => {
      const pid = c.programId.toString();
      if (!programMap[pid]) programMap[pid] = [];
      programMap[pid].push({ id: c._id.toString(), title: c.title });
    });

    const programIds = Object.keys(programMap).map(
      (p) => new mongoose.Types.ObjectId(p)
    );

    // 2️⃣ Build enrollment match — use "programId" (NOT "program")
    const enrollmentMatch: any = { programId: { $in: programIds } };
    if (status && status !== "all") {
      enrollmentMatch.status = status;
    }

    // 3️⃣ Aggregate: join users, then filter by search if provided
    const aggregatePipeline: any[] = [
      { $match: enrollmentMatch },
      // Join student user record
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
    ];

    // Search filter applied after join (so we can search name/email)
    if (search && (search as string).trim()) {
      const regex = { $regex: (search as string).trim(), $options: "i" };
      aggregatePipeline.push({
        $match: {
          $or: [
            { "student.firstName": regex },
            { "student.lastName": regex },
            { "student.email": regex },
          ],
        },
      });
    }

    // Count total (before pagination) — run in parallel with paged query
    const countPipeline = [...aggregatePipeline, { $count: "total" }];

    const dataPipeline = [
      ...aggregatePipeline,
      { $sort: { enrollmentDate: -1 } },
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      {
        $project: {
          _id: "$student._id",
          firstName: "$student.firstName",
          lastName: "$student.lastName",
          email: "$student.email",
          profileImage: "$student.profileImage",
          studentProfile: "$student.studentProfile",
          enrollmentDate: 1,
          status: 1,
          programId: 1,   // keep programId so we can map courses below
        },
      },
    ];

    const [countResult, students] = await Promise.all([
      Enrollment.aggregate(countPipeline),
      Enrollment.aggregate(dataPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;

    // 4️⃣ Attach courses & aggregate progress per student
    const studentIds = students.map((s: any) => s._id);

    const progressDocs = await Progress.find({
      studentId: { $in: studentIds },
      courseId: { $in: courses.map((c) => c._id) },
    }).select("studentId overallProgress completedLessons totalLessons lastAccessedAt");

    // One student can have multiple progress docs (one per course).
    // Aggregate them into a single "best" summary per student.
    const progressMap = new Map<
      string,
      {
        overallProgress: number;
        completedLessons: number;
        totalLessons: number;
        lastAccessedAt: Date | null;
        count: number;
      }
    >();

    progressDocs.forEach((p) => {
      const key = p.studentId.toString();
      const existing = progressMap.get(key);
      if (!existing) {
        progressMap.set(key, {
          overallProgress: p.overallProgress || 0,
          completedLessons: p.completedLessons || 0,
          totalLessons: p.totalLessons || 0,
          lastAccessedAt: p.lastAccessedAt || null,
          count: 1,
        });
      } else {
        // Accumulate then average later
        existing.overallProgress += p.overallProgress || 0;
        existing.completedLessons += p.completedLessons || 0;
        existing.totalLessons += p.totalLessons || 0;
        existing.count += 1;
        // Keep most recent lastAccessedAt
        if (
          p.lastAccessedAt &&
          (!existing.lastAccessedAt || p.lastAccessedAt > existing.lastAccessedAt)
        ) {
          existing.lastAccessedAt = p.lastAccessedAt;
        }
      }
    });

    const result = students.map((s: any) => {
      const studentCourses = programMap[s.programId?.toString()] || [];
      const prog = progressMap.get(s._id.toString());

      return {
        ...s,
        courses: studentCourses,
        progress: prog
          ? {
              overallProgress: Math.round(prog.overallProgress / prog.count),
              completedLessons: prog.completedLessons,
              totalLessons: prog.totalLessons,
              lastAccessedAt: prog.lastAccessedAt,
            }
          : {
              overallProgress: 0,
              completedLessons: 0,
              totalLessons: 0,
              lastAccessedAt: null,
            },
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
      .select("_id title slug description instructorId programId coverImage");

    if (!course || !course.instructorId.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    // === STUDENT ENROLLMENT ===
    const enrollment = await Enrollment.findOne({
      studentId,
      programId: course.programId,
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
    const rawModules = await Module.find({ courseId: courseId })
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
export const getPendingSubmissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Not authorized" });

  const { courseId, page = "1", limit = "10" } = req.query;

  // ✅ Get courseIds belonging to this instructor — Submission has no instructorId field
  const instructorCourses = await Course.find({ instructorId: req.user._id }).select("_id title programId instructorId coverImage");
  const courseIds = instructorCourses.map(c => c._id);

  const filter: any = {
    courseId: { $in: courseIds },   // ✅ was: instructorId: req.user._id (field doesn't exist)
    status: SubmissionStatus.SUBMITTED,
  };

  if (courseId && mongoose.Types.ObjectId.isValid(courseId as string)) {
    filter.courseId = courseId; // narrow to specific course if provided
  }

  const total = await Submission.countDocuments(filter);

  const submissions = await Submission.find(filter)
    .populate("studentId", "firstName lastName email profileImage")
    .populate("assessmentId", "title type totalPoints passingScore")
    .populate("courseId", "title coverImage") // ✅ Add course info for grading context
    .sort({ submittedAt: 1 }) // oldest first — grade in order
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  return res.status(200).json({
    success: true,
    count: submissions.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: submissions,
  });
});

// @desc    Grade a submission
// @route   PUT /api/v1/instructors/submissions/:id/grade
// @access  Instructor only
export const gradeSubmission = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const numericScore = Number(req.body.score);
  if (isNaN(numericScore)) return res.status(400).json({ success: false, error: "Invalid score" });

  // ✅ was: findOne({ _id, instructorId }) — instructorId doesn't exist on Submission
  // Instead verify ownership through the course
  const submission = await Submission.findById(req.params.id)
    .populate("assessmentId")
    .populate("studentId");

  if (!submission) return res.status(404).json({ success: false, error: "Submission not found" });

  // Verify this instructor owns the course
  const course = await Course.findOne({
    _id: submission.courseId,
    instructorId: req.user._id,   // ✅ ownership check on Course, not Submission
  });
  if (!course) return res.status(403).json({ success: false, error: "Access denied" });

  const assessment: any = submission.assessmentId;
  const totalPoints = assessment.totalPoints || 100;

  if (numericScore < 0 || numericScore > totalPoints) {
    return res.status(400).json({ success: false, error: `Score must be 0–${totalPoints}` });
  }

  submission.score = numericScore;
  submission.percentage = Math.round((numericScore / totalPoints) * 100);
  submission.feedback = req.body.feedback;
  submission.status = SubmissionStatus.GRADED;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user._id;
  await submission.save();

  const student: any = submission.studentId;
  await Progress.findOneAndUpdate(
    { studentId: student._id, courseId: submission.courseId },
    { $inc: { completedAssessments: 1 } },
    { upsert: true }
  );

  await pushNotification({
    userId: student._id,
    ...NotificationTemplates.assessmentGraded(assessment.title, numericScore),
    relatedId: assessment._id,
    relatedModel: "Assessment",
  });

  return res.json({ success: true, message: "Submission graded", data: submission });
});


// @desc    Get all submissions for a specific assessment (instructor view)
// @route   GET /api/v1/instructors/assessments/:assessmentId/submissions
// @access  Instructor only
export const getSubmissionsByAssessment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authorized' })

    const { assessmentId } = req.params
    const { page = '1', limit = '10', status } = req.query

    if (!mongoose.Types.ObjectId.isValid(assessmentId)) {
      return res.status(400).json({ success: false, error: 'Invalid assessment ID' })
    }

    // Verify the assessment belongs to one of this instructor's courses
    const assessment = await Assessment.findById(assessmentId).select('courseId title questions')
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found' })
    }

    const course = await Course.findOne({
      _id: assessment.courseId,
      instructorId: req.user._id,
    }).select('_id title')

    if (!course) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    const filter: any = { assessmentId }
    if (status && status !== 'all') filter.status = status

    const total = await Submission.countDocuments(filter)

    const submissions = await Submission.find(filter)
      .populate('studentId', 'firstName lastName email profileImage')
      // Populate assessmentId WITH questions so the detail page can show question text
      .populate({
        path: 'assessmentId',
        select: 'title type totalPoints passingScore questions',
      })
      .sort({ submittedAt: 1 }) // oldest first for grading queue
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string))

    return res.status(200).json({
      success: true,
      count: submissions.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: submissions,
    })
  }
)

// @desc    Get a single submission by ID (instructor view)
// @route   GET /api/v1/instructors/submissions/:id
// @access  Instructor only
export const getSubmissionById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authorized' })

    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID' })
    }

    const submission = await Submission.findById(id)
      .populate('studentId', 'firstName lastName email profileImage studentProfile')
      // Include questions so the grading UI can display question text next to each answer
      .populate({
        path: 'assessmentId',
        select: 'title type totalPoints passingScore questions endDate',
      })
      .populate('courseId', 'title coverImage') // Add course info for context

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' })
    }

    // Verify ownership through the course
    const course = await Course.findOne({
      _id: submission.courseId,
      instructorId: req.user._id,
    }).select('_id title instructorId')

    if (!course) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    return res.status(200).json({ success: true, data: submission })
  }
)


// ============================================
// ANNOUNCEMENTS
// ============================================

// @desc    Send announcement to course students
// @route   POST /api/v1/instructors/courses/:courseId/announcements
// @access  Instructor only
export const sendCourseAnnouncement = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false });

  const course = await Course.findOne({ _id: req.params.courseId, instructorId: req.user._id });
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

  const courses = await Course.find({ instructorId: req.user._id });
  const courseIds = courses.map(c => c._id);

  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);

  const [totalEnrollments, activeStudents, pendingSubmissions, gradedThisWeek, recentSubmissions] =
    await Promise.all([
     Enrollment.countDocuments({ 'coursesProgress.courseId': { $in: courseIds } }),
      Enrollment.countDocuments({ 'coursesProgress.courseId': { $in: courseIds }, status: 'active' }),

      // ✅ was: { instructorId: req.user._id, status: SUBMITTED } — instructorId doesn't exist
      Submission.countDocuments({
        courseId: { $in: courseIds },
        status: SubmissionStatus.SUBMITTED,
      }),

      // ✅ same fix for graded count
      Submission.countDocuments({
        courseId: { $in: courseIds },
        status: SubmissionStatus.GRADED,
        gradedAt: { $gte: oneWeekAgo },
      }),

      // ✅ same fix for recent submissions
      Submission.find({ courseId: { $in: courseIds } })
        .populate("studentId", "firstName lastName")
        .populate("assessmentId", "title")
        .sort({ submittedAt: -1 })
        .limit(5),
    ]);

  return res.json({
    success: true,
    data: {
      courses: { total: courses.length, published: courses.filter(c => c.isPublished).length },
      students: { totalEnrollments, active: activeStudents },
      assessments: { pendingSubmissions, gradedThisWeek },
      recentActivity: { submissions: recentSubmissions },
    },
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
  const courses = await Course.find({ instructorId: req.user._id }).select("_id title programId approvalStatus isPublished coverImage");

  const modules = await Module.find({
    courseId: { $in: courses.map((c) => c._id) }
  })
    .populate("courseId", "title programId approvalStatus isPublished coverImage")
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
  const courses = await Course.find({ instructorId: req.user._id }).select("_id title programId approvalStatus isPublished coverImage");
  const modules = await Module.find({ courseId: { $in: courses.map(c => c._id) } }).select("_id title courseId");

  const lessons = await Lesson.find({
    moduleId: { $in: modules.map((m) => m._id) }
  })
    .populate({
      path: "moduleId",
      select: "title courseId",
      populate: { path: "courseId", select: "title programId approvalStatus isPublished coverImage" }
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

  const courses = await Course.find({ instructorId: req.user._id }).select("_id title programId approvalStatus isPublished coverImage");

  const assessments = await Assessment.find({
    courseId: { $in: courses.map(c => c._id) }
  })
    .populate("courseId", "title programId approvalStatus isPublished coverImage")
    .sort({ updatedAt: -1 });

  return res.status(200).json({
    success: true,
    count: assessments.length,
    data: assessments
  });
});
