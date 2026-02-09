// ============================================
// src/controllers/enrollment.controller.ts
// ============================================

import { Response } from "express";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Program } from "../models/program";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Progress } from "../models/ProgressTrack";
import { User, UserRole } from "../models/user";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { pushNotification } from "../utils/pushNotification";
import { NotificationType } from "../models/Notification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { DiscountType, Scholarship, ScholarshipStatus } from "../models/Scholarship";
import { getIo } from "../config/socket";
import crypto from "crypto";
import emailService from "../utils/emailService";

interface EmailEntry {
  email: string;
  firstName?: string;
  lastName?: string;
  cohort?: string;
}

// ======================================================
// ENROLL A STUDENT IN A PROGRAM
// ======================================================
export const enrollStudent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId, programId, cohort, notes } = req.body;

  if (!studentId || !programId) {
    res.status(400).json({ success: false, error: "studentId and programId are required" });
    return;
  }

  // Get student and program details
  const student = await User.findById(studentId);
  const program = await Program.findById(programId).populate('courses');

  if (!student) {
    res.status(404).json({ success: false, error: "Student not found" });
    return;
  }

  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  if (!program.isPublished) {
    res.status(400).json({ success: false, error: "Program is not published" });
    return;
  }

  // Check enrollment limit
  if (program.enrollmentLimit) {
    const currentEnrollments = await Enrollment.countDocuments({ 
      program: programId, 
      status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] }
    });
    
    if (currentEnrollments >= program.enrollmentLimit) {
      res.status(400).json({ success: false, error: "Program enrollment limit reached" });
      return;
    }
  }

  // Check if enrollment already exists
  const existing = await Enrollment.findOne({ studentId, program: programId });
  if (existing) {
    res.status(400).json({ success: false, error: "Student already enrolled in this program" });
    return;
  }

  // Initialize courses progress for all courses in program
  const coursesProgress = await Promise.all(
    program.courses.map(async (courseId) => {
      const course = await Course.findById(courseId);
      if (!course) return null;

      // Count total lessons in course
      const modules = await Module.find({ course: courseId });
      const moduleIds = modules.map(m => m._id);
      const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

      return {
        course: courseId,
        status: EnrollmentStatus.PENDING,
        lessonsCompleted: 0,
        totalLessons
      };
    })
  );

  const validCoursesProgress = coursesProgress.filter(cp => cp !== null);

  // Create enrollment
  const enrollment = await Enrollment.create({
    studentId,
    program: programId,
    status: EnrollmentStatus.ACTIVE,
    cohort: cohort || student.studentProfile?.cohort,
    notes,
    coursesProgress: validCoursesProgress
  });

  // Create program-level progress tracker
  await Progress.create({
    studentId,
    programId,
    modules: [],
    overallProgress: 0,
    completedLessons: 0,
    totalLessons: validCoursesProgress.reduce((sum, cp) => sum + cp.totalLessons, 0),
    completedAssessments: 0,
    totalAssessments: 0,
    averageScore: 0,
    totalTimeSpent: 0,
    completedCourses: 0,
    totalCourses: program.courses.length,
    enrolledAt: new Date()
  });

  // Send notification to student
  await pushNotification({
    userId: student._id,
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled in Program",
    message: `You have been enrolled in ${program.title}`,
    relatedId: program._id,
    relatedModel: "Course",
  });

  // Emit real-time notification
  const io = getIo();
  io.to(student._id.toString()).emit("notification", {
    type: NotificationType.COURSE_UPDATE,
    title: "Successfully Enrolled",
    message: `Welcome to ${program.title}! You now have access to ${program.courses.length} courses.`,
    programId: program._id,
    timestamp: new Date(),
  });

  res.status(201).json({
    success: true,
    message: "Student enrolled in program successfully",
    data: enrollment
  });
});

// ======================================================
// BULK ENROLL STUDENTS IN A PROGRAM
// ======================================================
export const bulkEnrollStudentsInProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentIds, programId, cohort, notes } = req.body;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ success: false, error: "studentIds array is required" });
    return;
  }

  if (!programId) {
    res.status(400).json({ success: false, error: "programId is required" });
    return;
  }

  // Get program details
  const program = await Program.findById(programId).populate('courses');

  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  if (!program.isPublished) {
    res.status(400).json({ success: false, error: "Program is not published" });
    return;
  }

  const enrollments = [];
  const errors = [];
  const io = getIo();

  for (const studentId of studentIds) {
    try {
      // Validate student
      const student = await User.findById(studentId);
      if (!student) {
        errors.push({ 
          studentId, 
          error: 'Student not found',
          email: 'N/A'
        });
        continue;
      }

      if (student.role !== 'student') {
        errors.push({ 
          studentId, 
          error: 'User is not a student',
          email: student.email
        });
        continue;
      }

      // Check if already enrolled
      const existing = await Enrollment.findOne({ 
        studentId, 
        program: programId 
      });

      if (existing) {
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
          program: programId, 
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

      // Initialize courses progress for all courses in program
      const coursesProgress = await Promise.all(
        program.courses.map(async (courseId) => {
          const course = await Course.findById(courseId);
          if (!course) return null;

          const modules = await Module.find({ course: courseId });
          const moduleIds = modules.map(m => m._id);
          const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

          return {
            course: courseId,
            status: EnrollmentStatus.PENDING,
            lessonsCompleted: 0,
            totalLessons
          };
        })
      );

      const validCoursesProgress = coursesProgress.filter(cp => cp !== null);

      // Create enrollment
      const enrollment = await Enrollment.create({
        studentId,
        program: programId,
        status: EnrollmentStatus.ACTIVE,
        cohort: cohort || student.studentProfile?.cohort,
        notes: notes || `Bulk enrolled by admin`,
        coursesProgress: validCoursesProgress
      });

      // Create program-level progress tracker
      await Progress.create({
        studentId,
        programId,
        modules: [],
        overallProgress: 0,
        completedLessons: 0,
        totalLessons: validCoursesProgress.reduce((sum, cp) => sum + cp.totalLessons, 0),
        completedAssessments: 0,
        totalAssessments: 0,
        averageScore: 0,
        totalTimeSpent: 0,
        completedCourses: 0,
        totalCourses: program.courses.length,
        enrolledAt: new Date()
      });

      enrollments.push({
        enrollmentId: enrollment._id,
        studentId: student._id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentEmail: student.email
      });

      // Send notification to student
      await pushNotification({
        userId: student._id,
        type: NotificationType.COURSE_UPDATE,
        title: "Successfully Enrolled in Program",
        message: `You have been enrolled in ${program.title}`,
        relatedId: program._id,
        relatedModel: "Course",
      });

      // Emit real-time notification
      io.to(student._id.toString()).emit("notification", {
        type: NotificationType.COURSE_UPDATE,
        title: "Successfully Enrolled",
        message: `Welcome to ${program.title}! You now have access to ${program.courses.length} courses.`,
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

  res.status(200).json({
    success: true,
    message: `Bulk enrollment completed: ${enrollments.length} successful, ${errors.length} failed`,
    data: {
      enrolled: enrollments.length,
      failed: errors.length,
      enrollments,
      errors
    }
  });
});

// ======================================================
// BULK ENROLL BY EMAIL (Create users if needed)
// ======================================================
export const bulkEnrollByEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { emails, programId, cohort, notes, createUsers = true } = req.body;

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ success: false, error: "emails array is required" });
    return;
  }

  if (!programId) {
    res.status(400).json({ success: false, error: "programId is required" });
    return;
  }

  // Get program details
  const program = await Program.findById(programId).populate('courses');

  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  if (!program.isPublished) {
    res.status(400).json({ success: false, error: "Program is not published" });
    return;
  }

  const enrollments = [];
  const errors = [];
  const createdUsers = [];
  const io = getIo();

  for (const entry of emails) {
    const email = typeof entry === 'string' ? entry : entry.email;
    const firstName = typeof entry === 'object' ? entry.firstName : undefined;
    const lastName = typeof entry === 'object' ? entry.lastName : undefined;
    const userCohort = typeof entry === 'object' ? entry.cohort : undefined;

    try {
      // Validate email
      if (!email || !email.includes('@')) {
        errors.push({ 
          email: email || 'Invalid', 
          error: 'Invalid email format' 
        });
        continue;
      }

      // Check if user exists
      let student = await User.findOne({ email: email.toLowerCase() });

      // Create user if doesn't exist and createUsers is true
      if (!student && createUsers) {
        // Generate temporary password
        const tempPassword = crypto.randomBytes(8).toString('hex');
        
        // Extract first/last name from email if not provided
        const emailUsername = email.split('@')[0];
        const defaultFirstName = firstName || emailUsername.split('.')[0] || 'Student';
        const defaultLastName = lastName || emailUsername.split('.')[1] || '';

        // Create student account
        student = await User.create({
          email: email.toLowerCase(),
          firstName: defaultFirstName.charAt(0).toUpperCase() + defaultFirstName.slice(1),
          lastName: defaultLastName.charAt(0).toUpperCase() + defaultLastName.slice(1),
          password: tempPassword,
          role: UserRole.STUDENT,
          studentProfile: {
            cohort: userCohort || cohort,
            enrollmentDate: new Date()
          }
        });

        createdUsers.push({
          email: student.email,
          firstName: student.firstName,
          lastName: student.lastName,
          tempPassword
        });

        // Send welcome email with credentials
        try {
          await emailService.sendEmail({
            to: student.email,
            subject: `Welcome to ${program.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to AI Accelerator! 🎉</h1>
                </div>
                <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                  <p style="font-size: 16px; color: #333;">Hi ${student.firstName},</p>
                  <p style="font-size: 16px; color: #555; line-height: 1.6;">
                    You have been enrolled in <strong>${program.title}</strong>! Your account has been created.
                  </p>
                  
                  <div style="background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="margin: 0 0 10px 0; color: #0d47a1;">Your Login Credentials:</h3>
                    <p style="margin: 5px 0; color: #333;"><strong>Email:</strong> ${student.email}</p>
                    <p style="margin: 5px 0; color: #333;"><strong>Temporary Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${tempPassword}</code></p>
                  </div>
                  
                  <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #856404; font-size: 14px;">
                      ⚠️ <strong>Important:</strong> Please change your password after your first login for security.
                    </p>
                  </div>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.CLIENT_URL}/login" style="display: inline-block; padding: 14px 28px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                      Login to Your Account
                    </a>
                  </div>
                  
                  <p style="font-size: 14px; color: #666; margin-top: 30px;">
                    Best regards,<br>
                    <strong>AI Accelerator Team</strong>
                  </p>
                </div>
              </div>
            `
          });
        } catch (emailError) {
          console.error(`Failed to send welcome email to ${email}:`, emailError);
          // Continue even if email fails
        }
      } else if (!student) {
        errors.push({ 
          email, 
          error: 'User not found and createUsers is disabled' 
        });
        continue;
      }

      // Verify user is a student
      if (student.role !== UserRole.STUDENT) {
        errors.push({ 
          email, 
          error: 'User is not a student',
        });
        continue;
      }

      // Check if already enrolled
      const existing = await Enrollment.findOne({ 
        studentId: student._id, 
        program: programId 
      });

      if (existing) {
        errors.push({ 
          email, 
          error: 'Already enrolled in this program',
        });
        continue;
      }

      // Check enrollment limit
      if (program.enrollmentLimit) {
        const currentEnrollments = await Enrollment.countDocuments({ 
          program: programId, 
          status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] }
        });
        
        if (currentEnrollments >= program.enrollmentLimit) {
          errors.push({ 
            email, 
            error: 'Program enrollment limit reached',
          });
          continue;
        }
      }

      // Initialize courses progress
      const coursesProgress = await Promise.all(
        program.courses.map(async (courseId) => {
          const course = await Course.findById(courseId);
          if (!course) return null;

          const modules = await Module.find({ course: courseId });
          const moduleIds = modules.map(m => m._id);
          const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

          return {
            course: courseId,
            status: EnrollmentStatus.PENDING,
            lessonsCompleted: 0,
            totalLessons
          };
        })
      );

      const validCoursesProgress = coursesProgress.filter(cp => cp !== null);

      // Create enrollment
      const enrollment = await Enrollment.create({
        studentId: student._id,
        program: programId,
        status: EnrollmentStatus.ACTIVE,
        cohort: userCohort || cohort || student.studentProfile?.cohort,
        notes: notes || `Enrolled via ${createdUsers.some(u => u.email === email) ? 'email import (new user)' : 'email import'}`,
        coursesProgress: validCoursesProgress
      });

      // Create program-level progress tracker
      await Progress.create({
        studentId: student._id,
        programId,
        modules: [],
        overallProgress: 0,
        completedLessons: 0,
        totalLessons: validCoursesProgress.reduce((sum, cp) => sum + cp.totalLessons, 0),
        completedAssessments: 0,
        totalAssessments: 0,
        averageScore: 0,
        totalTimeSpent: 0,
        completedCourses: 0,
        totalCourses: program.courses.length,
        enrolledAt: new Date()
      });

      enrollments.push({
        enrollmentId: enrollment._id,
        studentId: student._id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentEmail: student.email,
        isNewUser: createdUsers.some(u => u.email === email)
      });

      // Send notification to student (only if not newly created)
      if (!createdUsers.some(u => u.email === email)) {
        await pushNotification({
          userId: student._id,
          type: NotificationType.COURSE_UPDATE,
          title: "Successfully Enrolled in Program",
          message: `You have been enrolled in ${program.title}`,
          relatedId: program._id,
          relatedModel: "Course",
        });

        // Emit real-time notification
        io.to(student._id.toString()).emit("notification", {
          type: NotificationType.COURSE_UPDATE,
          title: "Successfully Enrolled",
          message: `Welcome to ${program.title}! You now have access to ${program.courses.length} courses.`,
          programId: program._id,
          timestamp: new Date(),
        });
      }

    } catch (error: any) {
      errors.push({ 
        email, 
        error: error.message,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Bulk enrollment completed: ${enrollments.length} successful, ${errors.length} failed, ${createdUsers.length} new users created`,
    data: {
      enrolled: enrollments.length,
      failed: errors.length,
      newUsersCreated: createdUsers.length,
      enrollments,
      errors,
      createdUsers: createdUsers.map(u => ({
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        // Don't send password in production, or send separately
      }))
    }
  });
});

// ======================================================
// GET ALL STUDENTS FOR ENROLLMENT (Helper endpoint)
// ======================================================
export const getAvailableStudents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId, search, limit = '50' } = req.query;

  const filter: any = { role: 'student' };

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const students = await User.find(filter)
    .select('_id firstName lastName email cohort profileImage studentProfile')
    .limit(parseInt(limit as string))
    .sort({ firstName: 1 });

  // If programId is provided, mark already enrolled students
  if (programId) {
    const enrolledStudentIds = await Enrollment.find({ program: programId })
      .distinct('studentId');

    const studentsWithEnrollmentStatus = students.map(student => ({
      ...student.toObject(),
      isEnrolled: enrolledStudentIds.some(id => id.toString() === student._id.toString())
    }));

    return res.status(200).json({
      success: true,
      count: studentsWithEnrollmentStatus.length,
      data: studentsWithEnrollmentStatus
    });
  }

 return res.status(200).json({
    success: true,
    count: students.length,
    data: students
  });
});

// ======================================================
// SELF-ENROLL IN A PROGRAM (Student)
// ======================================================
export const selfEnrollInProgram = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { programId } = req.params;
  const { scholarshipCode, paymentMethod } = req.body;

  const program = await Program.findById(programId).populate('courses');

  if (!program) {
    res.status(404).json({ success: false, error: "Program not found" });
    return;
  }

  if (!program.isPublished) {
    res.status(400).json({ success: false, error: "This program is not available for enrollment" });
    return;
  }

  // Check enrollment limit
  if (program.enrollmentLimit) {
    const currentEnrollments = await Enrollment.countDocuments({ 
      program: programId, 
      status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] }
    });
    
    if (currentEnrollments >= program.enrollmentLimit) {
      res.status(400).json({ success: false, error: "Program enrollment is full" });
      return;
    }
  }

  // Check if already enrolled
  const existing = await Enrollment.findOne({ studentId: req.user._id, program: programId });
  if (existing) {
    res.status(400).json({ success: false, error: "You are already enrolled in this program" });
    return;
  }

  let scholarshipApplied = false;
  let discountAmount = 0;
  let finalPrice = program.price || 0;

  // Handle scholarship code if provided
  if (scholarshipCode && scholarshipCode.trim()) {
    const scholarship = await Scholarship.findOne({ 
      code: scholarshipCode.trim().toUpperCase(),
      programId: programId
    });

    if (!scholarship) {
      res.status(400).json({ success: false, error: "Invalid scholarship code" });
      return;
    }

    // Validate scholarship
     const validation = scholarship.validateForStudent(req.user.email);

    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    // Calculate discount
    if (scholarship.discountType === 'percentage') {
      discountAmount = (finalPrice * scholarship.discountValue) / 100;
    } else {
      discountAmount = Math.min(scholarship.discountValue, finalPrice);
    }

    finalPrice = Math.max(0, finalPrice - discountAmount);
    scholarshipApplied = true;

    // Mark scholarship as used
    await scholarship.markAsUsed(req.user._id);
  }

  // Check if payment is required
  if (finalPrice > 0 && !paymentMethod) {
    res.status(400).json({ 
      success: false, 
      error: "Payment required",
      data: {
        originalPrice: program.price,
        discountAmount,
        finalPrice,
        requiresPayment: true
      }
    });
    return;
  }

  // TODO: Implement payment processing if finalPrice > 0 && paymentMethod
  // For now, we'll only allow enrollment if finalPrice is 0 (free or 100% scholarship)
  if (finalPrice > 0) {
    res.status(400).json({ 
      success: false, 
      error: "Payment integration not yet implemented. Please use a 100% scholarship code or wait for payment feature.",
      data: {
        originalPrice: program.price,
        discountAmount,
        finalPrice,
        requiresPayment: true
      }
    });
    return;
  }

  // Initialize courses progress
  const coursesProgress = await Promise.all(
    program.courses.map(async (courseId) => {
      const course = await Course.findById(courseId);
      if (!course) return null;

      const modules = await Module.find({ course: courseId });
      const moduleIds = modules.map(m => m._id);
      const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

      return {
        course: courseId,
        status: EnrollmentStatus.PENDING,
        lessonsCompleted: 0,
        totalLessons
      };
    })
  );

  const validCoursesProgress = coursesProgress.filter(cp => cp !== null);

  // Create enrollment with scholarship info
  const enrollment = await Enrollment.create({
    studentId: req.user._id,
    program: programId,
    status: EnrollmentStatus.ACTIVE,
    cohort: req.user.studentProfile?.cohort,
    coursesProgress: validCoursesProgress,
    notes: scholarshipApplied ? `Enrolled with scholarship code: ${scholarshipCode}` : undefined
  });

  // Create program-level progress
  await Progress.create({
    studentId: req.user._id,
    programId,
    modules: [],
    overallProgress: 0,
    completedLessons: 0,
    totalLessons: validCoursesProgress.reduce((sum, cp) => sum + cp.totalLessons, 0),
    completedAssessments: 0,
    totalAssessments: 0,
    averageScore: 0,
    totalTimeSpent: 0,
    completedCourses: 0,
    totalCourses: program.courses.length,
    enrolledAt: new Date()
  });

  // Send notification
  const notificationMessage = scholarshipApplied 
    ? `Congratulations! You've been successfully enrolled in ${program.title} with a scholarship.`
    : `You have successfully enrolled in ${program.title}`;

  const notification = NotificationTemplates.courseEnrolled(program.title);
  await pushNotification({
    userId: req.user._id,
    type: notification.type,
    title: scholarshipApplied ? "Scholarship Enrollment Successful!" : notification.title,
    message: notificationMessage,
    relatedId: program._id,
    relatedModel: "Course",
  });

  // Emit real-time notification
  const io = getIo();
  io.to(req.user._id.toString()).emit("notification", {
    type: notification.type,
    title: scholarshipApplied ? "Scholarship Enrollment Successful!" : "Enrollment Successful",
    message: notificationMessage,
    programId: program._id,
    timestamp: new Date(),
  });

  res.status(201).json({
    success: true,
    message: scholarshipApplied 
      ? "Successfully enrolled with scholarship" 
      : "Successfully enrolled in program",
    data: {
      enrollment,
      scholarshipApplied,
      originalPrice: program.price,
      discountAmount,
      finalPrice
    }
  });
});


// ======================================================
// VALIDATE SCHOLARSHIP CODE (Preview)
// ======================================================
export const validateScholarshipCode = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { code, programId } = req.body;

    if (!code || !programId) {
      res.status(400).json({ success: false, error: "Code and programId required" });
      return;
    }

    const scholarship = await Scholarship.findOne({
      code: code.trim().toUpperCase(),
      programId,
      status: ScholarshipStatus.ACTIVE,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } },
      ],
    }).populate("programId", "title price currency");

    if (!scholarship) {
      res.status(404).json({ success: false, error: "Invalid scholarship code" });
      return;
    }

    const validation = scholarship.validateForStudent(req.user.email);

    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const program = scholarship.programId as any;
    const originalPrice = program.price || 0;

    let discountAmount = 0;
    if (scholarship.discountType === DiscountType.PERCENTAGE) {
      discountAmount = (originalPrice * scholarship.discountValue) / 100;
    } else {
      discountAmount = Math.min(scholarship.discountValue, originalPrice);
    }

    const finalPrice = Math.max(0, originalPrice - discountAmount);

    res.status(200).json({
      success: true,
      message: "Scholarship code is valid",
      data: {
        scholarshipCode: scholarship.code,
        discountType: scholarship.discountType,
        discountValue: scholarship.discountValue,
        originalPrice,
        discountAmount,
        finalPrice,
        program: {
          id: program._id,
          title: program.title,
          currency: program.currency,
        },
        expiresAt: scholarship.expiresAt,
      },
    });
  }
);


// ======================================================
// GET ALL ENROLLMENTS (ADMIN)
// ======================================================
export const getAllEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, programId, cohort, page = '1', limit = '20' } = req.query;

  const filter: any = {};
  if (status) filter.status = status;
  if (programId) filter.program = programId;
  if (cohort) filter.cohort = cohort;

  const total = await Enrollment.countDocuments(filter);

  const enrollments = await Enrollment.find(filter)
    .populate("studentId", "firstName lastName email cohort profileImage")
    .populate("program", "title slug estimatedHours")
    .sort({ enrollmentDate: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  res.status(200).json({ 
    success: true, 
    count: enrollments.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: enrollments 
  });
});

// ======================================================
// GET ENROLLMENTS FOR A STUDENT
// ======================================================
export const getStudentEnrollments = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const enrollments = await Enrollment.find({ studentId: req.user._id })
    .populate({
      path: "program",
      select: "title description slug estimatedHours coverImage courses",
      populate: {
        path: "courses",
        select: "title description order estimatedHours"
      }
    })
    .sort({ enrollmentDate: -1 });

  // Enhance with progress data
  const enrollmentsWithProgress = await Promise.all(
    enrollments.map(async (enrollment) => {
      const progress = await Progress.findOne({
        studentId: req.user!._id,
        programId: enrollment.program._id
      });

      return {
        ...enrollment.toObject(),
        progress
      };
    })
  );

  res.status(200).json({ 
    success: true, 
    count: enrollmentsWithProgress.length, 
    data: enrollmentsWithProgress 
  });
});

// ======================================================
// GET SINGLE ENROLLMENT DETAILS
// ======================================================
export const getEnrollmentById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate("studentId", "firstName lastName email cohort profileImage")
    .populate({
      path: "program",
      populate: {
        path: "courses",
        select: "title description order estimatedHours"
      }
    });

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  // Get progress data
  const progress = await Progress.findOne({
    studentId: enrollment.studentId._id,
    programId: enrollment.program._id
  });

  res.status(200).json({ 
    success: true, 
    data: {
      enrollment,
      progress
    }
  });
});

// ======================================================
// UPDATE ENROLLMENT STATUS
// ======================================================
export const updateEnrollmentStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;
  const { status, completionDate, dropDate, notes } = req.body;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('studentId', 'firstName lastName')
    .populate('program', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  const oldStatus = enrollment.status;
  
  if (status) enrollment.status = status;
  if (completionDate) enrollment.completionDate = completionDate;
  if (dropDate) enrollment.dropDate = dropDate;
  if (notes !== undefined) enrollment.notes = notes;

  await enrollment.save();

  // Notify student if status changed
  if (status && status !== oldStatus) {
    const student = enrollment.studentId as any;
    const program = enrollment.program as any;
    
    let notificationMessage = '';
    let notificationType = NotificationType.COURSE_UPDATE;

    switch (status) {
      case EnrollmentStatus.COMPLETED:
        notificationMessage = `Congratulations! You have completed the ${program.title} program`;
        notificationType = NotificationType.CERTIFICATE_ISSUED;
        break;
      case EnrollmentStatus.SUSPENDED:
        notificationMessage = `Your enrollment in ${program.title} has been suspended`;
        break;
      case EnrollmentStatus.DROPPED:
        notificationMessage = `Your enrollment in ${program.title} has been dropped`;
        break;
      case EnrollmentStatus.ACTIVE:
        notificationMessage = `Your enrollment in ${program.title} is now active`;
        break;
      default:
        notificationMessage = `Your enrollment status in ${program.title} has been updated to ${status}`;
    }

    await pushNotification({
      userId: student._id,
      type: notificationType,
      title: "Enrollment Status Updated",
      message: notificationMessage,
      relatedId: program._id,
      relatedModel: "Course",
    });

    // Emit real-time notification
    const io = getIo();
    io.to(student._id.toString()).emit("notification", {
      type: notificationType,
      title: "Enrollment Status Updated",
      message: notificationMessage,
      programId: program._id,
      timestamp: new Date(),
    });
  }

  res.status(200).json({ success: true, message: "Enrollment updated", data: enrollment });
});

// ======================================================
// UPDATE COURSE PROGRESS WITHIN ENROLLMENT
// ======================================================
export const updateCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId, courseId } = req.params;
  const { status, lessonsCompleted, completionDate } = req.body;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('program', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  // Find the course progress entry
  const courseProgressIndex = enrollment.coursesProgress.findIndex(
    cp => cp.course.toString() === courseId
  );

  if (courseProgressIndex === -1) {
    res.status(404).json({ success: false, error: "Course not found in enrollment" });
    return;
  }

  // Update course progress
  if (status) enrollment.coursesProgress[courseProgressIndex].status = status;
  if (lessonsCompleted !== undefined) {
    enrollment.coursesProgress[courseProgressIndex].lessonsCompleted = lessonsCompleted;
  }
  if (completionDate) {
    enrollment.coursesProgress[courseProgressIndex].completionDate = completionDate;
  }

  await enrollment.save();

  // Check if all courses are completed
  const allCoursesCompleted = enrollment.coursesProgress.every(
    cp => cp.status === EnrollmentStatus.COMPLETED
  );

  if (allCoursesCompleted && enrollment.status !== EnrollmentStatus.COMPLETED) {
    enrollment.status = EnrollmentStatus.COMPLETED;
    enrollment.completionDate = new Date();
    await enrollment.save();

    // Notify student of program completion
    const student = enrollment.studentId as any;
    const program = enrollment.program as any;

    await pushNotification({
      userId: student._id,
      type: NotificationType.CERTIFICATE_ISSUED,
      title: "Program Completed!",
      message: `Congratulations! You have completed all courses in ${program.title}`,
      relatedId: enrollment.program._id,
      relatedModel: "Course",
    });
  }

  res.status(200).json({ 
    success: true, 
    message: "Course progress updated", 
    data: enrollment 
  });
});

// ======================================================
// DELETE ENROLLMENT
// ======================================================
export const deleteEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrollmentId } = req.params;

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate('studentId', 'firstName lastName')
    .populate('program', 'title');

  if (!enrollment) {
    res.status(404).json({ success: false, error: "Enrollment not found" });
    return;
  }

  const student = enrollment.studentId as any;
  const program = enrollment.program as any;

  // Delete associated progress records
  await Progress.deleteMany({
    studentId: student._id,
    programId: program._id
  });

  await enrollment.deleteOne();

  // Notify student about enrollment removal
  await pushNotification({
    userId: student._id,
    type: NotificationType.COURSE_UPDATE,
    title: "Enrollment Removed",
    message: `Your enrollment in ${program.title} has been removed`,
    relatedId: program._id,
    relatedModel: "Course",
  });

  res.status(200).json({ success: true, message: "Enrollment deleted successfully" });
});

// ======================================================
// GET ENROLLMENT STATISTICS
// ======================================================
export const getEnrollmentStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { programId } = req.query;

  const filter: any = {};
  if (programId) filter.program = programId;

  const totalEnrollments = await Enrollment.countDocuments(filter);
  const activeEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.ACTIVE });
  const completedEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.COMPLETED });
  const pendingEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.PENDING });
  const droppedEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.DROPPED });
  const suspendedEnrollments = await Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.SUSPENDED });

  const completionRate = totalEnrollments > 0 
    ? (completedEnrollments / totalEnrollments) * 100 
    : 0;

  res.status(200).json({
    success: true,
    data: {
      total: totalEnrollments,
      active: activeEnrollments,
      completed: completedEnrollments,
      pending: pendingEnrollments,
      dropped: droppedEnrollments,
      suspended: suspendedEnrollments,
      completionRate: Math.round(completionRate * 100) / 100
    }
  });
});