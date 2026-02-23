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


const BASE_URL = process.env.CLIENT_URL;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Resolves all course IDs that belong to a program, together with
 * the per-course lesson count needed to seed coursesProgress.
 */
async function buildCoursesProgress(programCourseIds: any[]) {
  return Promise.all(
    programCourseIds.map(async (cId) => {
      const modules = await Module.find({ courseId: cId }).select("_id");
      const moduleIds = modules.map((m) => m._id);
      const totalLessons = await Lesson.countDocuments({
        moduleId: { $in: moduleIds },
      });
      return {
        courseId: cId,
        status: EnrollmentStatus.PENDING,
        lessonsCompleted: 0,
        totalLessons,
      };
    })
  );
}

/**
 * Creates the program-level Progress document for a newly enrolled student.
 */
async function createProgressTracker(
  studentId: any,
  programId: any,
  coursesProgress: any[]
) {
  await Progress.create({
    studentId,
    programId,
    modules: [],
    overallProgress: 0,
    completedLessons: 0,
    totalLessons: coursesProgress.reduce(
      (sum, cp) => sum + (cp.totalLessons || 0),
      0
    ),
    completedAssessments: 0,
    totalAssessments: 0,
    averageScore: 0,
    totalTimeSpent: 0,
    completedCourses: 0,
    totalCourses: coursesProgress.length,
    enrolledAt: new Date(),
  });
}

/**
 * Notifies all instructors who own at least one course in the program
 * (push notification + real-time socket event).
 */
async function notifyInstructors(
  programCourseIds: any[],
  io: ReturnType<typeof getIo>,
  payload: {
    studentName: string;
    programTitle: string;
    programId: any;
    enrollmentId: any;
    title: string;
  }
) {
  const instructorIds = await Course.distinct("createdBy", {
    _id: { $in: programCourseIds },
  });

  await Promise.all(
    instructorIds.map((instructorId: any) =>
      pushNotification({
        userId: instructorId,
        type: NotificationType.ENROLLMENT,
        title: payload.title,
        message: `${payload.studentName} enrolled in ${payload.programTitle}`,
        relatedId: payload.enrollmentId,
        relatedModel: "Enrollment",
      })
    )
  );

  instructorIds.forEach((instructorId: any) => {
    io.to(instructorId.toString()).emit("notification", {
      type: NotificationType.ENROLLMENT,
      title: payload.title,
      message: `${payload.studentName} enrolled in ${payload.programTitle}`,
      programId: payload.programId,
      timestamp: new Date(),
    });
  });
}

// ─────────────────────────────────────────────────────────────
// ENROLL A STUDENT IN A PROGRAM  (admin / staff)
// ─────────────────────────────────────────────────────────────
export const enrollStudent = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { studentId, programId, cohort, notes } = req.body;

    if (!studentId || !programId) {
      res.status(400).json({
        success: false,
        error: "studentId and programId are required",
      });
      return;
    }

    const [student, program] = await Promise.all([
      User.findById(studentId),
      Program.findById(programId),
    ]);

    if (!student) {
      res.status(404).json({ success: false, error: "Student not found" });
      return;
    }
    if (student.role !== UserRole.STUDENT) {
      res.status(400).json({ success: false, error: "User is not a student" });
      return;
    }
    if (!program) {
      res.status(404).json({ success: false, error: "Program not found" });
      return;
    }
    if (!program.isPublished) {
      res
        .status(400)
        .json({ success: false, error: "Program is not published" });
      return;
    }

    // Enrollment-limit guard
    if (program.enrollmentLimit) {
      const count = await Enrollment.countDocuments({
        programId,
        status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] },
      });
      if (count >= program.enrollmentLimit) {
        res
          .status(400)
          .json({ success: false, error: "Program enrollment limit reached" });
        return;
      }
    }

    const existing = await Enrollment.findOne({ studentId, programId });
    if (existing) {
      res.status(400).json({
        success: false,
        error: "Student already enrolled in this program",
      });
      return;
    }

    // Build enrollment
    const programCourses = await Course.find({ programId }).select("_id");
    const programCourseIds = programCourses.map((c) => c._id);
    const coursesProgress = await buildCoursesProgress(programCourseIds);

    const enrollment = await Enrollment.create({
      studentId,
      programId,
      status: EnrollmentStatus.ACTIVE,
      cohort: cohort || student.studentProfile?.cohort,
      notes,
      coursesProgress,
    });

    await Course.updateMany(
      { _id: { $in: programCourseIds } },
      { $inc: { currentEnrollment: 1 } }
    );

    await createProgressTracker(studentId, programId, coursesProgress);

    // ── In-app + socket notifications ────────────────────────
    const io = getIo();
    const studentName = `${student.firstName} ${student.lastName}`;

    await pushNotification({
      userId: student._id,
      type: NotificationType.COURSE_UPDATE,
      title: "Successfully Enrolled in Program",
      message: `You have been enrolled in ${program.title}`,
      relatedId: program._id,
      relatedModel: "Program",
    });

    io.to(student._id.toString()).emit("notification", {
      type: NotificationType.COURSE_UPDATE,
      title: "Successfully Enrolled",
      message: `Welcome to ${program.title}! You now have access to ${programCourseIds.length} courses.`,
      programId: program._id,
      timestamp: new Date(),
    });

    await notifyInstructors(programCourseIds, io, {
      studentName,
      programTitle: program.title,
      programId: program._id,
      enrollmentId: enrollment._id,
      title: "New Student Enrolled",
    });

    // ── Email ─────────────────────────────────────────────────
    try {
      await emailService.sendEnrollmentConfirmationEmail(
        { email: student.email, firstName: student.firstName },
        {
          programTitle: program.title,
          courseCount: programCourseIds.length,
          loginUrl: `${BASE_URL}/auth/login`,
        }
      );
    } catch (emailErr) {
      console.error(
        `[Email] Failed to send enrollment confirmation to ${student.email}:`,
        emailErr
      );
    }

    res.status(201).json({
      success: true,
      message: "Student enrolled in program successfully",
      data: enrollment,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// BULK ENROLL STUDENTS IN A PROGRAM  (by studentId array)
// ─────────────────────────────────────────────────────────────
export const bulkEnrollStudentsInProgram = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { studentIds, programId, cohort, notes } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      res
        .status(400)
        .json({ success: false, error: "studentIds array is required" });
      return;
    }
    if (!programId) {
      res.status(400).json({ success: false, error: "programId is required" });
      return;
    }

    const program = await Program.findById(programId);
    if (!program) {
      res.status(404).json({ success: false, error: "Program not found" });
      return;
    }
    if (!program.isPublished) {
      res
        .status(400)
        .json({ success: false, error: "Program is not published" });
      return;
    }

    const programCourses = await Course.find({ programId }).select("_id");
    const programCourseIds = programCourses.map((c) => c._id);

    const io = getIo();
    const enrollments: any[] = [];
    const errors: any[] = [];

    for (const sid of studentIds) {
      try {
        const student = await User.findById(sid);
        if (!student) {
          errors.push({ studentId: sid, error: "Student not found", email: "N/A" });
          continue;
        }
        if (student.role !== UserRole.STUDENT) {
          errors.push({
            studentId: sid,
            error: "User is not a student",
            email: student.email,
          });
          continue;
        }

        const existing = await Enrollment.findOne({
          studentId: sid,
          programId,
        });
        if (existing) {
          errors.push({
            studentId: sid,
            error: "Already enrolled in this program",
            email: student.email,
          });
          continue;
        }

        if (program.enrollmentLimit) {
          const count = await Enrollment.countDocuments({
            programId,
            status: {
              $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE],
            },
          });
          if (count >= program.enrollmentLimit) {
            errors.push({
              studentId: sid,
              error: "Program enrollment limit reached",
              email: student.email,
            });
            continue;
          }
        }

        const coursesProgress = await buildCoursesProgress(programCourseIds);

        const enrollment = await Enrollment.create({
          studentId: sid,
          programId,
          status: EnrollmentStatus.ACTIVE,
          cohort: cohort || student.studentProfile?.cohort,
          notes: notes || "Bulk enrolled by admin",
          coursesProgress,
        });

        await Course.updateMany(
          { _id: { $in: programCourseIds } },
          { $inc: { currentEnrollment: 1 } }
        );

        await createProgressTracker(sid, programId, coursesProgress);

        const studentName = `${student.firstName} ${student.lastName}`;

        // In-app + socket
        await pushNotification({
          userId: student._id,
          type: NotificationType.COURSE_UPDATE,
          title: "Successfully Enrolled in Program",
          message: `You have been enrolled in ${program.title}`,
          relatedId: program._id,
          relatedModel: "Program",
        });

        io.to(student._id.toString()).emit("notification", {
          type: NotificationType.COURSE_UPDATE,
          title: "Successfully Enrolled",
          message: `Welcome to ${program.title}! You now have access to ${programCourseIds.length} courses.`,
          programId: program._id,
          timestamp: new Date(),
        });

        await notifyInstructors(programCourseIds, io, {
          studentName,
          programTitle: program.title,
          programId: program._id,
          enrollmentId: enrollment._id,
          title: "New Student Enrolled",
        });

        // ── Email ─────────────────────────────────────────────
        try {
          await emailService.sendEnrollmentConfirmationEmail(
            { email: student.email, firstName: student.firstName },
            {
              programTitle: program.title,
              courseCount: programCourseIds.length,
              loginUrl: `${BASE_URL}/auth/login`,
            }
          );
        } catch (emailErr) {
          console.error(
            `[Email] Bulk enroll – failed for ${student.email}:`,
            emailErr
          );
        }

        enrollments.push({
          enrollmentId: enrollment._id,
          studentId: student._id,
          studentName,
          studentEmail: student.email,
        });
      } catch (error: any) {
        errors.push({
          studentId: sid,
          error: error.message,
          email: "Error fetching email",
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
        errors,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// BULK ENROLL BY EMAIL  (creates accounts when needed)
// ─────────────────────────────────────────────────────────────
export const bulkEnrollByEmail = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { emails, programId, cohort, notes, createUsers = true } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      res
        .status(400)
        .json({ success: false, error: "emails array is required" });
      return;
    }
    if (!programId) {
      res.status(400).json({ success: false, error: "programId is required" });
      return;
    }

    const program = await Program.findById(programId);
    if (!program) {
      res.status(404).json({ success: false, error: "Program not found" });
      return;
    }
    if (!program.isPublished) {
      res
        .status(400)
        .json({ success: false, error: "Program is not published" });
      return;
    }

    const programCourses = await Course.find({ programId }).select("_id title");
    const programCourseIds = programCourses.map((c) => c._id);

    const io = getIo();
    const enrollments: any[] = [];
    const errors: any[] = [];
    const createdUsers: any[] = []; // contains tempPassword; stripped from response

    for (const entry of emails) {
      const email =
        typeof entry === "string" ? entry : (entry.email as string);
      const firstName =
        typeof entry === "object" ? entry.firstName : undefined;
      const lastName = typeof entry === "object" ? entry.lastName : undefined;
      const userCohort =
        typeof entry === "object" ? entry.cohort : undefined;

      try {
        if (!email || !email.includes("@")) {
          errors.push({
            email: email || "Invalid",
            error: "Invalid email format",
          });
          continue;
        }

        let student = await User.findOne({ email: email.toLowerCase() });
        let isNewUser = false;

        if (!student && createUsers) {
          isNewUser = true;
          const tempPassword = crypto.randomBytes(8).toString("hex");

          const emailUsername = email.split("@")[0];
          const defaultFirst =
            firstName ||
            emailUsername.split(".")[0] ||
            "Student";
          const defaultLast =
            lastName || emailUsername.split(".")[1] || "";

          const capitalize = (s: string) =>
            s.charAt(0).toUpperCase() + s.slice(1);

          student = await User.create({
            email: email.toLowerCase(),
            firstName: capitalize(defaultFirst),
            lastName: capitalize(defaultLast),
            password: tempPassword,
            role: UserRole.STUDENT,
            studentProfile: {
              cohort: userCohort || cohort,
              enrollmentDate: new Date(),
            },
          });

          createdUsers.push({
            email: student.email,
            firstName: student.firstName,
            lastName: student.lastName,
            tempPassword, // kept internally; excluded from response
          });

          // Welcome + credentials email for brand-new accounts
          try {
            await emailService.sendNewAccountEnrollmentEmail(
              { email: student.email, firstName: student.firstName },
              {
                tempPassword,
                programTitle: program.title,
                loginUrl: `${BASE_URL}/auth/changePassword?email=${encodeURIComponent(student.email)}`,
              }
            );
          } catch (emailErr) {
            console.error(
              `[Email] Failed welcome email to ${email}:`,
              emailErr
            );
          }
        } else if (!student) {
          errors.push({
            email,
            error: "User not found and createUsers is disabled",
          });
          continue;
        }

        if (student.role !== UserRole.STUDENT) {
          errors.push({ email, error: "User is not a student" });
          continue;
        }

        const existing = await Enrollment.findOne({
          studentId: student._id,
          programId,
        });
        if (existing) {
          errors.push({ email, error: "Already enrolled in this program" });
          continue;
        }

        if (program.enrollmentLimit) {
          const count = await Enrollment.countDocuments({
            programId,
            status: {
              $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE],
            },
          });
          if (count >= program.enrollmentLimit) {
            errors.push({ email, error: "Program enrollment limit reached" });
            continue;
          }
        }

        const coursesProgress = await buildCoursesProgress(programCourseIds);

        const enrollment = await Enrollment.create({
          studentId: student._id,
          programId,
          status: EnrollmentStatus.ACTIVE,
          cohort: userCohort || cohort || student.studentProfile?.cohort,
          notes:
            notes ||
            `Enrolled via ${isNewUser ? "email import (new user)" : "email import"}`,
          coursesProgress,
        });

        await Course.updateMany(
          { _id: { $in: programCourseIds } },
          { $inc: { currentEnrollment: 1 } }
        );

        await createProgressTracker(student._id, programId, coursesProgress);

        // In-app + socket for existing users (new users get the welcome email instead)
        if (!isNewUser) {
          await pushNotification({
            userId: student._id,
            type: NotificationType.COURSE_UPDATE,
            title: "Successfully Enrolled in Program",
            message: `You have been enrolled in ${program.title}`,
            relatedId: program._id,
            relatedModel: "Program",
          });

          io.to(student._id.toString()).emit("notification", {
            type: NotificationType.COURSE_UPDATE,
            title: "Successfully Enrolled",
            message: `Welcome to ${program.title}! You now have access to ${programCourseIds.length} courses.`,
            programId: program._id,
            timestamp: new Date(),
          });

          // Enrollment confirmation email for existing users
          try {
            await emailService.sendEnrollmentConfirmationEmail(
              { email: student.email, firstName: student.firstName },
              {
                programTitle: program.title,
                courseCount: programCourseIds.length,
                loginUrl: `${BASE_URL}/auth/login`,
              }
            );
          } catch (emailErr) {
            console.error(
              `[Email] Enrollment confirmation failed for ${email}:`,
              emailErr
            );
          }
        }

        await notifyInstructors(programCourseIds, io, {
          studentName: `${student.firstName} ${student.lastName}`,
          programTitle: program.title,
          programId: program._id,
          enrollmentId: enrollment._id,
          title: "New Student Enrolled",
        });

        enrollments.push({
          enrollmentId: enrollment._id,
          studentId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          studentEmail: student.email,
          isNewUser,
        });
      } catch (error: any) {
        errors.push({ email, error: error.message });
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
        // tempPassword intentionally omitted
        createdUsers: createdUsers.map(({ email, firstName, lastName }) => ({
          email,
          firstName,
          lastName,
        })),
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// GET AVAILABLE STUDENTS  (helper for admin UI)
// ─────────────────────────────────────────────────────────────
export const getAvailableStudents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { programId, search, limit = "50" } = req.query;

    const filter: any = { role: UserRole.STUDENT };
    if (search) {
      filter.$or = [
        { firstName: { $regex: search as string, $options: "i" } },
        { lastName: { $regex: search as string, $options: "i" } },
        { email: { $regex: search as string, $options: "i" } },
      ];
    }

    const students = await User.find(filter)
      .select("_id firstName lastName email profileImage studentProfile")
      .limit(parseInt(limit as string))
      .sort({ firstName: 1 });

    if (programId) {
      const enrolledStudentIds = await Enrollment.find({
        programId,
      }).distinct("studentId");

      const studentsWithStatus = students.map((s) => ({
        ...s.toObject(),
        cohort: s.studentProfile?.cohort,
        isEnrolled: enrolledStudentIds.some(
          (id) => id.toString() === s._id.toString()
        ),
      }));

      return res.status(200).json({
        success: true,
        count: studentsWithStatus.length,
        data: studentsWithStatus,
      });
    }

    return res.status(200).json({
      success: true,
      count: students.length,
      data: students.map((s) => ({
        ...s.toObject(),
        cohort: s.studentProfile?.cohort,
      })),
    });
  }
);

// ─────────────────────────────────────────────────────────────
// SELF-ENROLL IN A PROGRAM  (student-facing)
// ─────────────────────────────────────────────────────────────
export const selfEnrollInProgram = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { programId } = req.params;
    const { scholarshipCode, paymentMethod } = req.body;

    const program = await Program.findById(programId);
    if (!program) {
      res.status(404).json({ success: false, error: "Program not found" });
      return;
    }
    if (!program.isPublished) {
      res.status(400).json({
        success: false,
        error: "This program is not available for enrollment",
      });
      return;
    }

    if (program.enrollmentLimit) {
      const count = await Enrollment.countDocuments({
        programId,
        status: { $in: [EnrollmentStatus.PENDING, EnrollmentStatus.ACTIVE] },
      });
      if (count >= program.enrollmentLimit) {
        res
          .status(400)
          .json({ success: false, error: "Program enrollment is full" });
        return;
      }
    }

    const existing = await Enrollment.findOne({
      studentId: req.user._id,
      programId,
    });
    if (existing) {
      res.status(400).json({
        success: false,
        error: "You are already enrolled in this program",
      });
      return;
    }

    const programCourses = await Course.find({ programId }).select("_id");
    const programCourseIds = programCourses.map((c) => c._id);

    let scholarshipApplied = false;
    let discountAmount = 0;
    let finalPrice = program.price || 0;

    if (scholarshipCode?.trim()) {
      const scholarship = await Scholarship.findOne({
        code: scholarshipCode.trim().toUpperCase(),
        programId,
        status: ScholarshipStatus.ACTIVE,
      });
      if (!scholarship) {
        res
          .status(400)
          .json({ success: false, error: "Invalid scholarship code" });
        return;
      }

      const validation = scholarship.validateForStudent(req.user.email);
      if (!validation.valid) {
        res.status(400).json({ success: false, error: validation.error });
        return;
      }

      discountAmount =
        scholarship.discountType === DiscountType.PERCENTAGE
          ? (finalPrice * scholarship.discountValue) / 100
          : Math.min(scholarship.discountValue, finalPrice);

      finalPrice = Math.max(0, finalPrice - discountAmount);
      scholarshipApplied = true;

      await scholarship.markAsUsed(req.user._id);
    }

    if (finalPrice > 0 && !paymentMethod) {
      res.status(400).json({
        success: false,
        error: "Payment required",
        data: {
          originalPrice: program.price,
          discountAmount,
          finalPrice,
          requiresPayment: true,
        },
      });
      return;
    }

    if (finalPrice > 0) {
      res.status(400).json({
        success: false,
        error:
          "Payment integration not yet implemented. Please use a 100% scholarship code or wait for payment feature.",
        data: {
          originalPrice: program.price,
          discountAmount,
          finalPrice,
          requiresPayment: true,
        },
      });
      return;
    }

    const coursesProgress = await buildCoursesProgress(programCourseIds);

    const enrollment = await Enrollment.create({
      studentId: req.user._id,
      programId,
      status: EnrollmentStatus.ACTIVE,
      cohort: req.user.studentProfile?.cohort,
      coursesProgress,
      notes: scholarshipApplied
        ? `Enrolled with scholarship code: ${scholarshipCode}`
        : undefined,
    });

    await createProgressTracker(req.user._id, programId, coursesProgress);

    const notification = NotificationTemplates.courseEnrolled(program.title);
    const notificationMessage = scholarshipApplied
      ? `Congratulations! You've been successfully enrolled in ${program.title} with a scholarship.`
      : `You have successfully enrolled in ${program.title}`;

    // In-app + socket
    await pushNotification({
      userId: req.user._id,
      type: notification.type,
      title: scholarshipApplied
        ? "Scholarship Enrollment Successful!"
        : notification.title,
      message: notificationMessage,
      relatedId: program._id,
      relatedModel: "Program",
    });

    const io = getIo();
    io.to(req.user._id.toString()).emit("notification", {
      type: notification.type,
      title: scholarshipApplied
        ? "Scholarship Enrollment Successful!"
        : "Enrollment Successful",
      message: notificationMessage,
      programId: program._id,
      timestamp: new Date(),
    });

    await notifyInstructors(programCourseIds, io, {
      studentName: `${req.user.firstName} ${req.user.lastName}`,
      programTitle: program.title,
      programId: program._id,
      enrollmentId: enrollment._id,
      title: "New Student Self-Enrolled",
    });

    // ── Email ─────────────────────────────────────────────────
    try {
      if (scholarshipApplied) {
        await emailService.sendScholarshipEnrollmentEmail(
          { email: req.user.email, firstName: req.user.firstName },
          {
            programTitle: program.title,
            scholarshipCode: scholarshipCode!,
            originalPrice: program.price || 0,
            discountAmount,
            finalPrice,
            courseCount: programCourseIds.length,
            loginUrl: `${BASE_URL}/dashboard`,
          }
        );
      } else {
        await emailService.sendEnrollmentConfirmationEmail(
          { email: req.user.email, firstName: req.user.firstName },
          {
            programTitle: program.title,
            courseCount: programCourseIds.length,
            loginUrl: `${BASE_URL}/dashboard`,
          }
        );
      }
    } catch (emailErr) {
      console.error(
        `[Email] Self-enroll email failed for ${req.user.email}:`,
        emailErr
      );
    }

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
        finalPrice,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// VALIDATE SCHOLARSHIP CODE  (preview – no side-effects)
// ─────────────────────────────────────────────────────────────
export const validateScholarshipCode = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { code, programId } = req.body;
    if (!code || !programId) {
      res
        .status(400)
        .json({ success: false, error: "Code and programId required" });
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
      res
        .status(404)
        .json({ success: false, error: "Invalid scholarship code" });
      return;
    }

    const validation = scholarship.validateForStudent(req.user.email);
    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const programDoc = scholarship.programId as any;
    const originalPrice = programDoc.price || 0;

    const discountAmount =
      scholarship.discountType === DiscountType.PERCENTAGE
        ? (originalPrice * scholarship.discountValue) / 100
        : Math.min(scholarship.discountValue, originalPrice);

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
          id: programDoc._id,
          title: programDoc.title,
          currency: programDoc.currency,
        },
        expiresAt: scholarship.expiresAt,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// GET ALL ENROLLMENTS  (admin)
// ─────────────────────────────────────────────────────────────
export const getAllEnrollments = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const {
      status,
      programId,
      cohort,
      page = "1",
      limit = "20",
    } = req.query;

    const filter: any = {};
    if (status) filter.status = status;
    if (programId) filter.programId = programId;
    if (cohort) filter.cohort = cohort;

    const total = await Enrollment.countDocuments(filter);

    const enrollments = await Enrollment.find(filter)
      .populate("studentId", "firstName lastName email profileImage studentProfile")
      .populate("programId", "title slug estimatedHours")
      .populate("coursesProgress.courseId", "title")
      .sort({ enrollmentDate: -1 })
      .skip((parseInt(page as string) - 1) * parseInt(limit as string))
      .limit(parseInt(limit as string))
      .lean();

    const mappedEnrollments = enrollments.map((enrollment: any) => ({
      ...enrollment,
      program: enrollment.programId,
    }));

    res.status(200).json({
      success: true,
      count: mappedEnrollments.length,
      total,
      page: parseInt(page as string),
      pages: Math.ceil(total / parseInt(limit as string)),
      data: mappedEnrollments,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// GET ENROLLMENTS FOR THE LOGGED-IN STUDENT
// ─────────────────────────────────────────────────────────────
export const getStudentEnrollments = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const enrollments = await Enrollment.find({ studentId: req.user._id })
      .populate({
        path: "programId",
        select: "title description slug estimatedHours coverImage",
      })
      .sort({ enrollmentDate: -1 });

    const out = await Promise.all(
      enrollments.map(async (en) => {
        const program = en.programId as any;
        const courses = await Course.find({ programId: program._id })
          .select("title description order estimatedHours")
          .sort({ order: 1 });
        const progress = await Progress.findOne({
          studentId: req.user!._id,
          programId: program._id,
        });
        return { ...en.toObject(), programId: { ...program.toObject(), courses }, progress };
      })
    );

    res.status(200).json({ success: true, count: out.length, data: out });
  }
);

// ─────────────────────────────────────────────────────────────
// GET SINGLE ENROLLMENT DETAILS
// ─────────────────────────────────────────────────────────────
export const getEnrollmentById = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { enrollmentId } = req.params;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate("studentId", "firstName lastName email profileImage studentProfile")
      .populate("programId", "title description slug estimatedHours coverImage");

    if (!enrollment) {
      res.status(404).json({ success: false, error: "Enrollment not found" });
      return;
    }

    const program = enrollment.programId as any;
    const courses = await Course.find({ programId: program._id })
      .select("title description order estimatedHours")
      .sort({ order: 1 });

    const progress = await Progress.findOne({
      studentId: (enrollment.studentId as any)._id,
      programId: program._id,
    });

    res.status(200).json({
      success: true,
      data: {
        enrollment: {
          ...enrollment.toObject(),
          programId: { ...program.toObject(), courses },
        },
        progress,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────
// UPDATE ENROLLMENT STATUS  (admin)
// ─────────────────────────────────────────────────────────────
export const updateEnrollmentStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { enrollmentId } = req.params;
    const { status, completionDate, dropDate, notes } = req.body;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate("studentId", "firstName lastName email")
      .populate("programId", "title");

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

    if (status && status !== oldStatus) {
      const student = enrollment.studentId as any;
      const program = enrollment.programId as any;

      let notificationTitle = "Enrollment Status Updated";
      let notificationMessage = `Your enrollment status in ${program.title} has been updated to ${status}`;
      let notificationType = NotificationType.COURSE_UPDATE;
      let emailType: "completed" | "suspended" | "dropped" | "reactivated" | "generic" = "generic";

      switch (status) {
        case EnrollmentStatus.COMPLETED:
          notificationMessage = `Congratulations! You have completed the ${program.title} program`;
          notificationType = NotificationType.CERTIFICATE_ISSUED;
          emailType = "completed";
          break;
        case EnrollmentStatus.SUSPENDED:
          notificationMessage = `Your enrollment in ${program.title} has been suspended`;
          emailType = "suspended";
          break;
        case EnrollmentStatus.DROPPED:
          notificationMessage = `Your enrollment in ${program.title} has been dropped`;
          emailType = "dropped";
          break;
        case EnrollmentStatus.ACTIVE:
          notificationMessage = `Your enrollment in ${program.title} is now active`;
          emailType = "reactivated";
          break;
      }

      await pushNotification({
        userId: student._id,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        relatedId: program._id,
        relatedModel: "Program",
      });

      const io = getIo();
      io.to(student._id.toString()).emit("notification", {
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        programId: program._id,
        timestamp: new Date(),
      });

      // ── Email ─────────────────────────────────────────────
      try {
        await emailService.sendEnrollmentStatusUpdateEmail(
          { email: student.email, firstName: student.firstName },
          {
            programTitle: program.title,
            newStatus: status,
            emailType,
            message: notificationMessage,
            dashboardUrl: `${BASE_URL}/dashboard`,
          }
        );
      } catch (emailErr) {
        console.error(
          `[Email] Status update email failed for ${student.email}:`,
          emailErr
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Enrollment updated",
      data: enrollment,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// UPDATE COURSE PROGRESS WITHIN AN ENROLLMENT
// ─────────────────────────────────────────────────────────────
export const updateCourseProgress = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { enrollmentId, courseId } = req.params;
    const { status, lessonsCompleted, completionDate } = req.body;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate("studentId", "firstName lastName email")
      .populate("programId", "title");

    if (!enrollment) {
      res.status(404).json({ success: false, error: "Enrollment not found" });
      return;
    }

    const idx = enrollment.coursesProgress.findIndex(
      (cp) => cp.courseId.toString() === courseId
    );
    if (idx === -1) {
      res
        .status(404)
        .json({ success: false, error: "Course not found in enrollment" });
      return;
    }

    if (status) enrollment.coursesProgress[idx].status = status;
    if (lessonsCompleted !== undefined)
      enrollment.coursesProgress[idx].lessonsCompleted = lessonsCompleted;
    if (completionDate)
      enrollment.coursesProgress[idx].completionDate = completionDate;

    await enrollment.save();

    const allCoursesCompleted = enrollment.coursesProgress.every(
      (cp) => cp.status === EnrollmentStatus.COMPLETED
    );

    if (
      allCoursesCompleted &&
      enrollment.status !== EnrollmentStatus.COMPLETED
    ) {
      enrollment.status = EnrollmentStatus.COMPLETED;
      enrollment.completionDate = new Date();
      await enrollment.save();

      const student = enrollment.studentId as any;
      const program = enrollment.programId as any;

      await pushNotification({
        userId: student._id,
        type: NotificationType.CERTIFICATE_ISSUED,
        title: "Program Completed!",
        message: `Congratulations! You have completed all courses in ${program.title}`,
        relatedId: program._id,
        relatedModel: "Program",
      });

      // ── Completion email ───────────────────────────────────
      try {
        await emailService.sendProgramCompletionEmail(
          { email: student.email, firstName: student.firstName },
          {
            programTitle: program.title,
            completionDate: new Date(),
            dashboardUrl: `${BASE_URL}/dashboard`,
          }
        );
      } catch (emailErr) {
        console.error(
          `[Email] Completion email failed for ${student.email}:`,
          emailErr
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Course progress updated",
      data: enrollment,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// DELETE ENROLLMENT
// ─────────────────────────────────────────────────────────────
export const deleteEnrollment = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { enrollmentId } = req.params;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate("studentId", "firstName lastName email")
      .populate("programId", "title");

    if (!enrollment) {
      res.status(404).json({ success: false, error: "Enrollment not found" });
      return;
    }

    const student = enrollment.studentId as any;
    const program = enrollment.programId as any;

    const courseIds = enrollment.coursesProgress.map((cp) => cp.courseId);
    await Course.updateMany(
      { _id: { $in: courseIds } },
      { $inc: { currentEnrollment: -1 } }
    );

    await Progress.deleteMany({
      studentId: student._id,
      programId: program._id,
    });

    await enrollment.deleteOne();

    await pushNotification({
      userId: student._id,
      type: NotificationType.COURSE_UPDATE,
      title: "Enrollment Removed",
      message: `Your enrollment in ${program.title} has been removed`,
      relatedId: program._id,
      relatedModel: "Program",
    });

    // ── Email ─────────────────────────────────────────────────
    try {
      await emailService.sendEnrollmentRemovedEmail(
        { email: student.email, firstName: student.firstName },
        {
          programTitle: program.title,
          supportUrl: `${BASE_URL}/support`,
        }
      );
    } catch (emailErr) {
      console.error(
        `[Email] Removal email failed for ${student.email}:`,
        emailErr
      );
    }

    res
      .status(200)
      .json({ success: true, message: "Enrollment deleted successfully" });
  }
);

// ─────────────────────────────────────────────────────────────
// GET ENROLLMENT STATISTICS
// ─────────────────────────────────────────────────────────────
export const getEnrollmentStats = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { programId } = req.query;
    const filter: any = {};
    if (programId) filter.programId = programId;

    const [total, active, completed, pending, dropped, suspended] =
      await Promise.all([
        Enrollment.countDocuments(filter),
        Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.ACTIVE }),
        Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.COMPLETED }),
        Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.PENDING }),
        Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.DROPPED }),
        Enrollment.countDocuments({ ...filter, status: EnrollmentStatus.SUSPENDED }),
      ]);

    const completionRate =
      total > 0 ? Math.round((completed / total) * 10000) / 100 : 0;

    res.status(200).json({
      success: true,
      data: { total, active, completed, pending, dropped, suspended, completionRate },
    });
  }
);