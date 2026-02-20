// ============================================
// src/controllers/admin.controller.ts
// ============================================
import { Response } from 'express';
import mongoose from 'mongoose';
import { Program } from '../models/program';
import { Course } from '../models/Course';
import { User, UserRole, UserStatus } from '../models/user';
import { Enrollment, EnrollmentStatus } from '../models/Enrollment';
import { Progress } from '../models/ProgressTrack';
import { AuthRequest } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/asyncHandler';
import { QueryHelper } from '../utils/queryHelper';
import { pushNotification } from '../utils/pushNotification';
import { getIo } from '../config/socket';
import { NotificationType } from '../models/Notification';
import { Certificate } from '../models/Certificate';
import { CloudinaryHelper } from '../utils/cloudinaryHelper';
import { Module } from '../models/Module';
import { Lesson } from '../models/Lesson';
import { cache } from '../utils/cache';


const getProgramCacheKey = (id: string) => `program:full:${id}`;
const invalidateProgramCache = (id: string) => {
  cache.delete(getProgramCacheKey(id));
};

// ============================================
// USER MANAGEMENT
// ============================================

// @desc    Get all users with filtering, sorting, and pagination
// @route   GET /api/admin/users
// @access  Admin only
export const getAllUsers = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { role, status, cohort, search, page = '1', limit = '10' } = req.query;

    // Build filter object
    const filter: any = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    // cohort lives under studentProfile.cohort, not at root
    if (cohort) filter['studentProfile.cohort'] = cohort;

    // Create query
    let query = User.find(filter).select('-password -refreshTokens -accessToken');

    // Apply search
    const queryHelper = new QueryHelper(query, req.query);
    queryHelper.search(['firstName', 'lastName', 'email']);

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Apply sorting and pagination
    query = queryHelper.sort().paginate().query;

    const users = await query;

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: users,
    });
  }
);

// @desc    Get single user by ID with detailed info
// @route   GET /api/admin/users/:id
// @access  Admin only
export const getUserById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.params.id).select(
      '-password -refreshTokens -accessToken'
    );

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Enrollment model: programId + coursesProgress.courseId
    const enrollments = await Enrollment.find({ studentId: user._id })
      .populate('programId', 'title')
      .populate('coursesProgress.courseId', 'title');

    const progress = await Progress.find({ studentId: user._id })
      .populate('courseId', 'title');

    const certificates = await Certificate.find({ studentId: user._id });

    res.status(200).json({
      success: true,
      data: {
        user,
        enrollments,
        progress,
        certificates,
      },
    });
  }
);

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Admin only
export const updateUser = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { firstName, lastName, email, role, status, cohort, phoneNumber } = req.body;
    const io = getIo();

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user && req.user._id.toString() === user._id.toString() && role && role !== UserRole.ADMIN) {
      return res.status(400).json({ success: false, error: 'You cannot change your own admin role' });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;

    // cohort is inside studentProfile
    if (cohort !== undefined) {
      user.studentProfile = user.studentProfile || {};
      user.studentProfile.cohort = cohort;
    }

    if (role && Object.values(UserRole).includes(role)) user.role = role;
    if (status && Object.values(UserStatus).includes(status)) user.status = status;

    await user.save();

    // Push real-time notification
    const notification = await pushNotification({
      userId: user._id,
      type: NotificationType.ANNOUNCEMENT,
      title: 'Profile Updated',
      message: `Your profile has been updated by an admin.`,
    });

    io.to(user._id.toString()).emit('notification', notification);

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  }
);


// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Admin only
export const deleteUser = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const io = getIo();
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user && req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }

    if (user.profileImage && user.profileImage !== 'default-avatar.png') {
      try {
        const publicId = CloudinaryHelper.extractPublicId(user.profileImage);
        if (publicId) await CloudinaryHelper.deleteFile(publicId, 'image');
      } catch (error) { console.error(error); }
    }

    await Enrollment.deleteMany({ studentId: user._id });
    await Progress.deleteMany({ studentId: user._id });
    await Certificate.deleteMany({ studentId: user._id });
    await user.deleteOne();

    // Notify user if they are online
    const notification = await pushNotification({
      userId: user._id,
      type: NotificationType.ANNOUNCEMENT,
      title: 'Account Deleted',
      message: 'Your account has been deleted by an admin.',
    });
    io.to(user._id.toString()).emit('notification', notification);

    return res.status(200).json({
      success: true,
      message: 'User and all related data deleted successfully',
    });
  }
);


// @desc    Update user status (suspend, activate, graduate)
// @route   PATCH /api/admin/users/:id/status
// @access  Admin only
export const updateUserStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status } = req.body;

    if (!status || !Object.values(UserStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Invalid status provided',
      });
      return;
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    user.status = status;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      data: user,
    });
  }
);

// @desc    Update user role
// @route   PATCH /api/admin/users/:id/role
// @access  Admin only
export const updateUserRole = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { role } = req.body;

    if (!role || !Object.values(UserRole).includes(role)) {
      res.status(400).json({
        success: false,
        error: 'Invalid role provided',
      });
      return;
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Prevent self-demotion
    if (req.user && req.user._id.toString() === user._id.toString() && role !== UserRole.ADMIN) {
      res.status(400).json({
        success: false,
        error: 'You cannot change your own admin role',
      });
      return;
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      data: user,
    });
  }
);

// ============================================
// STUDENT MANAGEMENT
// ============================================

// @desc    Get all students with filtering and pagination
// @route   GET /api/admin/students
// @access  Admin & Instructor
export const getAllStudents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { status, cohort, search, page = '1', limit = '10' } = req.query;

    const filter: any = { role: UserRole.STUDENT };
    if (status) filter.status = status;
    if (cohort) filter['studentProfile.cohort'] = cohort;

    let query = User.find(filter).select('-password -refreshTokens -accessToken');

    const queryHelper = new QueryHelper(query, req.query);
    queryHelper.search(['firstName', 'lastName', 'email']);

    const total = await User.countDocuments(filter);
    query = queryHelper.sort().paginate().query;

    const students = await query;

    res.status(200).json({
      success: true,
      count: students.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: students,
    });
  }
);

// @desc    Get student progress by ID
// @route   GET /api/admin/students/:id/progress
// @access  Admin & Instructor
export const getStudentProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const student = await User.findById(req.params.id);

    if (!student || student.role !== UserRole.STUDENT) {
      res.status(404).json({
        success: false,
        error: 'Student not found',
      });
      return;
    }

    const progress = await Progress.find({ studentId: student._id })
      .populate('courseId', 'title estimatedHours')
      .populate('modules.moduleId', 'title weekNumber');

    // Enrollment does not have top-level courseId; populate programId + coursesProgress.courseId
    const enrollments = await Enrollment.find({ studentId: student._id })
      .populate('programId', 'title')
      .populate('coursesProgress.courseId', 'title');

    res.status(200).json({
      success: true,
      data: {
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          cohort: student.studentProfile?.cohort,
        },
        progress,
        enrollments,
      },
    });
  }
);

// ============================================
// INSTRUCTOR MANAGEMENT
// ============================================

// @desc    Get all instructors
// @route   GET /api/admin/instructors
// @access  Admin only
export const getAllInstructors = asyncHandler(async (req, res) => {
  const users = await User.find({ role: UserRole.INSTRUCTOR })
    .select("firstName lastName profileImage bio title skills rating reviews");

  const instructors = users.map(u => ({
    id: u._id,
    name: `${u.firstName} ${u.lastName}`,
    profileImage: u.profileImage,
    role: UserRole.INSTRUCTOR,
    bio: u.instructorProfile?.bio || "",
  }));

  res.status(200).json({
    success: true,
    count: instructors.length,
    data: instructors
  });
});

// @desc    Promote student to instructor
// @route   PATCH /api/admin/users/:id/promote-instructor
// @access  Admin only
export const promoteToInstructor = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    if (user.role !== UserRole.STUDENT) {
      res.status(400).json({
        success: false,
        error: 'Only students can be promoted to instructors',
      });
      return;
    }

    user.role = UserRole.INSTRUCTOR;
    await user.save();

    res.status(200).json({
      success: true,
      message: `${user.firstName} ${user.lastName} promoted to instructor`,
      data: user,
    });
  }
);

// @desc    Demote instructor to student
// @route   PATCH /api/admin/users/:id/demote-instructor
// @access  Admin only
export const demoteToStudent = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    if (user.role !== UserRole.INSTRUCTOR) {
      res.status(400).json({
        success: false,
        error: 'Only instructors can be demoted to students',
      });
      return;
    }

    user.role = UserRole.STUDENT;
    await user.save();

    res.status(200).json({
      success: true,
      message: `${user.firstName} ${user.lastName} demoted to student`,
      data: user,
    });
  }
);

// ============================================
// DASHBOARD STATISTICS
// ============================================

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Admin only
export const getDashboardStats = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // User statistics
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: UserRole.STUDENT });
    const totalInstructors = await User.countDocuments({ role: UserRole.INSTRUCTOR });
    const activeUsers = await User.countDocuments({ status: UserStatus.ACTIVE });
    const graduatedUsers = await User.countDocuments({ status: UserStatus.GRADUATED });

    // Course statistics
    const totalCourses = await Course.countDocuments();
    const publishedCourses = await Course.countDocuments({ isPublished: true });

    // Enrollment statistics
    const totalEnrollments = await Enrollment.countDocuments();
    const activeEnrollments = await Enrollment.countDocuments({ status: EnrollmentStatus.ACTIVE });
    const completedEnrollments = await Enrollment.countDocuments({ status: EnrollmentStatus.COMPLETED });

    // Certificate statistics
    const totalCertificates = await Certificate.countDocuments();
    const issuedCertificates = await Certificate.countDocuments({ status: 'issued' });

    // Recent activity
    // User doesn't have top-level enrollmentDate; use createdAt (and studentProfile.enrollmentDate if needed on UI)
    const recentUsers = await User.find()
      .select('firstName lastName email role createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentEnrollments = await Enrollment.find()
      .populate('studentId', 'firstName lastName email profileImage')
      .populate('programId', 'title price currency')
      .populate('coursesProgress.courseId', 'title description')
      .sort({ enrollmentDate: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          students: totalStudents,
          instructors: totalInstructors,
          active: activeUsers,
          graduated: graduatedUsers,
        },
        courses: {
          total: totalCourses,
          published: publishedCourses,
        },
        enrollments: {
          total: totalEnrollments,
          active: activeEnrollments,
          completed: completedEnrollments,
        },
        certificates: {
          total: totalCertificates,
          issued: issuedCertificates,
        },
        recentActivity: {
          users: recentUsers,
          enrollments: recentEnrollments,
        },
      },
    });
  }
);

// ============================================
// BULK OPERATIONS
// ============================================

// @desc    Bulk enroll students to a program
// @route   POST /api/admin/bulk/enroll
// @access  Admin only
export const bulkEnrollStudents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { studentIds, programId, cohort } = req.body; // programId-based bulk
    const io = getIo();

    // Validate program
    const program = await Program.findById(programId);
    if (!program) {
      return res.status(404).json({ success: false, error: 'Program not found' });
    }

    if (!program.isPublished) {
      return res.status(400).json({ success: false, error: 'Program is not published' });
    }

    // Fetch courses under this program (no reliance on Program.courses)
    const programCourses = await Course.find({ programId }).select('_id title');

    const enrollments: any[] = [];
    const errors: any[] = [];

    for (const studentId of studentIds) {
      try {
        const student = await User.findById(studentId);
        if (!student || student.role !== UserRole.STUDENT) {
          errors.push({
            studentId,
            error: 'Student not found or invalid role',
            email: student?.email || 'N/A'
          });
          continue;
        }

        // Check if already enrolled in this PROGRAM
        const existingEnrollment = await Enrollment.findOne({
          studentId,
          programId
        });

        if (existingEnrollment) {
          errors.push({
            studentId,
            error: 'Already enrolled in this program',
            email: student.email
          });
          continue;
        }

        // Check enrollment limit
        if (program.enrollmentLimit) {
          const currentEnrollments = await Enrollment.countDocuments({
            programId,
            status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] }
          });

          if (currentEnrollments >= program.enrollmentLimit) {
            errors.push({
              studentId,
              error: 'Program enrollment limit reached',
              email: student.email
            });
            continue;
          }
        }

        // Initialize coursesProgress for all courses in the program
        const coursesProgress = await Promise.all(
          programCourses.map(async (c) => {
            const modules = await Module.find({ courseId: c._id }).select('_id');
            const moduleIds = modules.map(m => m._id);
            const totalLessons = await Lesson.countDocuments({
              moduleId: { $in: moduleIds }
            });

            return {
              courseId: c._id,
              status: EnrollmentStatus.PENDING,
              lessonsCompleted: 0,
              totalLessons
            };
          })
        );

        // Create enrollment with programId reference
        const enrollment = await Enrollment.create({
          studentId,
          programId,
          status: EnrollmentStatus.ACTIVE,
          cohort: cohort || student.studentProfile?.cohort,
          notes: `Bulk enrolled by admin`,
          coursesProgress
        });

        // Create program-level progress tracker (no courseId)
        await Progress.create({
          studentId,
          programId,
          modules: [],
          overallProgress: 0,
          completedLessons: 0,
          totalLessons: coursesProgress.reduce((sum, cp) => sum + (cp.totalLessons || 0), 0),
          completedAssessments: 0,
          totalAssessments: 0,
          averageScore: 0,
          totalTimeSpent: 0,
          completedCourses: 0,
          totalCourses: programCourses.length,
          enrolledAt: new Date()
        });

        enrollments.push({
          enrollmentId: enrollment._id,
          studentId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          studentEmail: student.email
        });

        // Notify student about program enrollment
        const notification = await pushNotification({
          userId: student._id,
          type: NotificationType.COURSE_UPDATE,
          title: 'Program Enrollment',
          message: `You have been enrolled in ${program.title}`,
          relatedId: program._id,
          relatedModel: 'Program', // ✅ use Program
        });

        io.to(student._id.toString()).emit('notification', {
          type: NotificationType.COURSE_UPDATE,
          title: 'Successfully Enrolled',
          message: `Welcome to ${program.title}! You now have access to ${programCourses.length} courses.`,
          programId: program._id,
          timestamp: new Date(),
        });

      } catch (error: any) {
        errors.push({
          studentId,
          error: error.message,
          email: 'Error fetching email'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk enrollment completed: ${enrollments.length} successful, ${errors.length} failed`,
      data: {
        enrolled: enrollments.length,
        failed: errors.length,
        enrollments,
        errors
      },
    });
  }
);

// @desc    Bulk update user status
// @route   PATCH /api/admin/bulk/status
// @access  Admin only
export const bulkUpdateStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { userIds, status } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Please provide an array of user IDs',
      });
      return;
    }

    if (!status || !Object.values(UserStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Invalid status provided',
      });
      return;
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { status } }
    );

    res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} users to ${status} status`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
    });
  }
);

// ============================================
// REPORTS & EXPORTS
// ============================================

// @desc    Get user activity report
// @route   GET /api/admin/reports/user-activity
// @access  Admin only
export const getUserActivityReport = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { startDate, endDate, cohort } = req.query;

    const filter: any = {};
    if (cohort) filter['studentProfile.cohort'] = cohort;
    if (startDate || endDate) {
      filter.lastLogin = {};
      if (startDate) filter.lastLogin.$gte = new Date(startDate as string);
      if (endDate) filter.lastLogin.$lte = new Date(endDate as string);
    }

    const users = await User.find(filter)
      .select('firstName lastName email role studentProfile.cohort lastLogin createdAt')
      .sort({ lastLogin: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  }
);

// @desc    Get course completion report
// @route   GET /api/admin/reports/course-completion
// @access  Admin only
export const getCourseCompletionReport = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { courseId } = req.query;

    const filter: any = {};
    if (courseId) filter.courseId = courseId;

    const completionData = await Progress.find(filter)
      .populate('studentId', 'firstName lastName email studentProfile.cohort')
      .populate('courseId', 'title')
      .select('overallProgress completedLessons totalLessons averageScore completedAt');

    res.status(200).json({
      success: true,
      count: completionData.length,
      data: completionData,
    });
  }
);


// ============================================
// PROGRAM CRUD
// ============================================

// @desc    Create a new program
// @route   POST /api/admin/programs
// @access  Admin
export const createProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, isPublished, ...rest } = req.body;

  const program = await Program.create({
    title,
    description,
    isPublished: !!isPublished,
    createdBy: req.user?._id,
    ...rest
  });

  res.status(201).json({
    success: true,
    message: 'Program created successfully',
    data: program,
  });
});

// @desc    Get all programs with filtering, pagination
// @route   GET /api/admin/programs
// @access  Admin
export const getAllPrograms = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, isPublished, page = '1', limit = '10' } = req.query;

  const filter: any = {};
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true';

  let query = Program.find(filter);
  const queryHelper = new QueryHelper(query, req.query);
  queryHelper.search(['title', 'description']);
  query = queryHelper.sort().paginate().query;

  const total = await Program.countDocuments(filter);
  const programs = await query.lean();

  // Attach a courseCount by querying courses per program (optional; avoid n+1 with aggregation if needed)
  const programIds = programs.map(p => p._id);
  const counts = await Course.aggregate([
    { $match: { programId: { $in: programIds } } },
    { $group: { _id: '$programId', count: { $sum: 1 } } }
  ]);
  const countMap = new Map<string, number>(counts.map(c => [c._id.toString(), c.count]));

  const out = programs.map(p => ({
    ...p,
    courseCount: countMap.get(p._id.toString()) || 0
  }));

  res.status(200).json({
    success: true,
    count: out.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: out,
  });
});

// @desc    Get program by ID
// @route   GET /api/admin/programs/:id
// @access  Admin
export const getProgramById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const program = await Program.findById(req.params.id);

  if (!program) return res.status(404).json({ success: false, error: 'Program not found' });

  // Also fetch its courses for convenience
  const courses = await Course.find({ programId: program._id })
    .select('title description isPublished order estimatedHours coverImage')
    .sort({ order: 1 });

  return res.status(200).json({
    success: true,
    data: { program, courses },
  });
});

// @desc    Update program
// @route   PUT /api/admin/programs/:id
// @access  Admin
export const updateProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, courses, isPublished, ...rest } = req.body;
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ success: false, error: 'Program not found' });

  if (title) program.title = title;
  if (description) program.description = description;
  if (isPublished !== undefined) program.isPublished = isPublished;

  // Optional: If client provides `courses` (array of courseIds), associate them with this program
  if (Array.isArray(courses) && courses.length > 0) {
    const courseIds = courses.map((c: string) => new mongoose.Types.ObjectId(c));
    await Course.updateMany(
      { _id: { $in: courseIds } },
      { $set: { programId: program._id } }
    );
  }

  Object.assign(program, rest);

  await program.save();

  invalidateProgramCache(program._id.toString());

  return res.status(200).json({
    success: true,
    message: 'Program updated successfully',
    data: program,
  });
});

// @desc    Delete program
// @route   DELETE /api/admin/programs/:id
// @access  Admin
export const deleteProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const program = await Program.findById(req.params.id);
  if (!program) return res.status(404).json({ success: false, error: 'Program not found' });

  // Optional: Safety check - ensure no courses remain linked (or detach them)
  await Course.updateMany({ programId: program._id }, { $unset: { programId: '' } });

  await program.deleteOne();

  invalidateProgramCache(program._id.toString());

  return res.status(200).json({
    success: true,
    message: 'Program deleted successfully',
  });
});

// ============================================
// PROGRAM REPORTS
// ============================================

// @desc    Get program student progress
// @route   GET /api/admin/programs/:id/progress
// @access  Admin
export const getProgramProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const programId = req.params.id;

  const program = await Program.findById(programId);
  if (!program) {
    return res.status(404).json({ success: false, error: 'Program not found' });
  }

  const courses = await Course.find({ programId: program._id }).select('_id title');
  const courseIds = courses.map(c => c._id);

  const enrollments = await Enrollment.find({ programId: program._id })
    .populate('studentId', 'firstName lastName email');

  const studentIds = enrollments.map(e => e.studentId._id);
  const progressList = await Progress.find({
    studentId: { $in: studentIds },
    courseId: { $in: courseIds },
  });

  const studentProgress = enrollments.map(enrollment => {
    const studentCourseProgress = progressList
      .filter(p => p.studentId.toString() === enrollment.studentId._id.toString())
      .map(p => ({
        course: p.courseId,
        overallProgress: p.overallProgress,
        completedLessons: p.completedLessons,
        totalLessons: p.totalLessons,
        completedAssessments: p.completedAssessments,
        totalAssessments: p.totalAssessments,
        averageScore: p.averageScore,
        totalTimeSpent: p.totalTimeSpent,
        lastAccessedAt: p.lastAccessedAt,
        completedAt: p.completedAt,
      }));

    return {
      student: enrollment.studentId,
      coursesProgress: studentCourseProgress,
      enrollmentStatus: enrollment.status,
      cohort: enrollment.cohort,
    };
  });

  return res.status(200).json({
    success: true,
    data: {
      program,
      studentProgress,
    },
  });
});


// @desc    Get course by ID (Admin) - Full details with populated references
// @route   GET /api/v1/admin/courses/:id
// @access  Admin only
export const getAdminCourseById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const course = await Course.findById(req.params.id)
      .populate('programId', 'title description slug')
      .populate('instructorId', 'firstName lastName email profileImage')
      .populate('createdBy', 'firstName lastName email profileImage');

    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    // Fetch modules and lessons explicitly (no reliance on Course.modules virtual in schema)
    const modules = await Module.find({ courseId: course._id })
      .sort({ order: 1 })
      .lean();

    const moduleIds = modules.map(m => m._id);
    const lessons = await Lesson.find({ moduleId: { $in: moduleIds } })
      .sort({ order: 1 })
      .select('title type order estimatedMinutes isPublished description moduleId')
      .lean();

    // Attach lessons to their modules
    const lessonsByModule = lessons.reduce((acc: Record<string, any[]>, lesson) => {
      const key = (lesson.moduleId as any).toString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(lesson);
      return acc;
    }, {});

    const modulesWithLessons = modules.map(m => ({
      ...m,
      lessons: lessonsByModule[m._id.toString()] || []
    }));

    // Calculate stats from collected modules/lessons
    const stats = {
      totalModules: modulesWithLessons.length,
      totalLessons: modulesWithLessons.reduce((sum, m: any) => sum + (m.lessons?.length || 0), 0),
      totalDuration: modulesWithLessons.reduce((sum: number, m: any) => {
        const moduleDuration = (m.lessons || []).reduce(
          (lessonSum: number, lesson: any) => lessonSum + (lesson.estimatedMinutes || 0),
          0
        );
        return sum + moduleDuration;
      }, 0)
    };

    return res.status(200).json({
      success: true,
      data: {
        ...course.toObject(),
        modules: modulesWithLessons,
        stats
      }
    });
  }
);