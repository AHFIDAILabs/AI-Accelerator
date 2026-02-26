import { Request, Response } from "express";
import { Certificate, CertificateStatus, ICertificate } from "../models/Certificate";
import { User, UserRole, IUser } from "../models/user";
import { Course, ICourse } from "../models/Course";
import { Module, IModule } from "../models/Module";
import { Program, IProgram } from "../models/program";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AuthRequest } from "../middlewares/auth";
import { getIo } from "../config/socket";
import { NotificationType } from "../models/Notification";
import { pushNotification } from "../utils/pushNotification";
import { Enrollment } from "../models/Enrollment";
import { Submission, SubmissionStatus } from "../models/Submission";
import { uploadDocumentToCloudinary } from "../middlewares/claudinary";
import path from "path";
import fs from "fs";

// ==============================
// ISSUE CERTIFICATE (Course or Program)
// ==============================
export const issueCertificate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { studentId, courseId, programId, grade, finalScore, pdfUrl } = req.body;

  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const student = await User.findById(studentId);
  if (!student || student.role !== "student") return res.status(404).json({ success: false, error: "Student not found" });

  let course: any = null;
  let program: any = null;

  if (courseId) {
    course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, error: "Course not found" });
  }

  if (programId) {
    program = await Program.findById(programId).populate('courses', '_id title');
    if (!program) return res.status(404).json({ success: false, error: "Program not found" });
  }

  // Prevent duplicate certificates
  const existing = await Certificate.findOne({ studentId, courseId, programId });
  if (existing) return res.status(400).json({ success: false, error: "Certificate already exists" });

 // METADATA CALCULATION
  let metadata: any = {};

  if (course) {
    const completedProjects = await Submission.countDocuments({
      studentId,
      courseId,
      status: SubmissionStatus.GRADED
    });

    const modules = await Module.find({ courseId: course._id }); // ✅ fixed: courseId not course
    metadata = {
      totalModules: modules.length,
      completedProjects,
      averageScore: finalScore || 0,
      totalHours: course.estimatedHours || 0
    };
  }

  if (program) {
    const enrollment = await Enrollment.findOne({ studentId, programId: program._id }); // ✅ fixed: programId not program
    let coursesCompleted = 0;
    if (enrollment) {
      coursesCompleted = enrollment.coursesProgress.filter((cp: any) => cp.status === "completed").length;
    }
    // ✅ Count actual courses from DB
    const totalCourses = await Course.countDocuments({ programId: program._id });

    metadata = {
      ...metadata,
      totalCourses,
      coursesCompleted
    };
  }

  // CREATE CERTIFICATE
  const certificate = await Certificate.create({
    studentId,
    courseId,
    programId,
    studentName: `${student.firstName} ${student.lastName}`,
    courseName: course?.title,
    programName: program?.title,
    status: CertificateStatus.ISSUED,
    completionDate: new Date(),
    grade,
    finalScore,
    pdfUrl,
    issuedBy: req.user._id,
    metadata,
  });

  // NOTIFY STUDENT
  await pushNotification({
    userId: student._id,
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: course
      ? `Congratulations! Your course certificate for ${course.title} is ready.`
      : `Congratulations! Your program certificate for ${program?.title} is ready.`,
    relatedId: certificate._id,
    relatedModel: "Certificate",
  });

  const io = getIo();
  io.to(student._id.toString()).emit("notification", {
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Certificate Issued",
    message: `Your certificate is ready to download.`,
    certificateId: certificate._id,
    courseId: course?._id,
    programId: program?._id,
    downloadUrl: pdfUrl,
    timestamp: new Date(),
  });

 return res.status(201).json({
    success: true,
    message: "Certificate issued successfully",
    data: certificate
  });
});

// ==============================
// REVOKE CERTIFICATE
// ==============================
export const revokeCertificate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate("studentId", "firstName lastName")
    .populate("courseId programId", "title") as ICertificate | null;

  if (!certificate)
    return res.status(404).json({ success: false, error: "Certificate not found" });

  if (certificate.status === CertificateStatus.REVOKED)
    return res.status(400).json({ success: false, error: "Certificate already revoked" });

  certificate.status = CertificateStatus.REVOKED;
  await certificate.save();

  // Notify student
  const student = certificate.studentId as unknown as IUser;
  const title = certificate.courseName ?? certificate.programName ?? "Certificate";
  await pushNotification({
    userId: student._id,
    type: NotificationType.ANNOUNCEMENT,
    title: "Certificate Revoked",
    message: `Your certificate for ${title} has been revoked.`,
    relatedId: certificate._id,
    relatedModel: "Certificate",
  });

  const io = getIo();
  io.to(student._id.toString()).emit("notification", {
    type: NotificationType.ANNOUNCEMENT,
    title: "Certificate Revoked",
    message: `Your certificate for ${title} has been revoked.`,
    certificateId: certificate._id,
    courseId: certificate.courseId,
    programId: certificate.programId,
    timestamp: new Date(),
  });

 return res.status(200).json({
    success: true,
    message: "Certificate revoked successfully",
    data: certificate,
  });
});

// ==============================
// GET CERTIFICATES
// ==============================
export const getAllCertificates = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const certificates = await Certificate.find()
    .populate("studentId", "firstName lastName email")
    .populate("courseId programId", "title");

  res.status(200).json({ success: true, count: certificates.length, data: certificates });
});

export const getStudentCertificates = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const certificates = await Certificate.find({ studentId: req.user._id })
    .populate("courseId programId", "title");

 return res.status(200).json({ success: true, count: certificates.length, data: certificates });
});

export const getCertificateById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate("studentId", "firstName lastName email")
    .populate("courseId programId", "title");

  if (!certificate) return res.status(404).json({ success: false, error: "Certificate not found" });

 return res.status(200).json({ success: true, data: certificate });
});


// ==============================
// GET CERTIFICATES BY STUDENT (Admin/Instructor)
// ==============================
export const getCertificatesByStudent = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { studentId } = req.params;

    const certificates = await Certificate.find({ studentId })
      .populate("courseId programId", "title")
      .populate("issuedBy", "firstName lastName")
      .sort({ completionDate: -1 });

    res.status(200).json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  }
);

// ==============================
// GET CERTIFICATES BY COURSE
// ==============================
export const getCertificatesByCourse = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { courseId } = req.params;

    const certificates = await Certificate.find({ courseId })
      .populate("studentId", "firstName lastName email")
      .populate("issuedBy", "firstName lastName")
      .sort({ completionDate: -1 });

    res.status(200).json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  }
);

// ==============================
// GET CERTIFICATES BY PROGRAM
// ==============================
export const getCertificatesByProgram = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { programId } = req.params;

    const certificates = await Certificate.find({ programId })
      .populate("studentId", "firstName lastName email")
      .populate("issuedBy", "firstName lastName")
      .sort({ completionDate: -1 });

    res.status(200).json({
      success: true,
      count: certificates.length,
      data: certificates,
    });
  }
);

// ==============================
// DOWNLOAD CERTIFICATE
// ==============================
export const downloadCertificate = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const certificate = await Certificate.findById(req.params.id);

    if (!certificate) {
      res.status(404).json({ success: false, error: "Certificate not found" });
      return;
    }

    // Students can only download their own certificates
    if (
      req.user.role === "student" &&
      certificate.studentId.toString() !== req.user._id.toString()
    ) {
      res.status(403).json({ success: false, error: "Access denied" });
      return;
    }

    // Check if certificate is revoked
    if (certificate.status === "revoked") {
      res.status(400).json({
        success: false,
        error: "This certificate has been revoked and cannot be downloaded",
      });
      return;
    }

    if (!certificate.pdfUrl) {
      res.status(404).json({
        success: false,
        error: "Certificate PDF not available",
      });
      return;
    }

    // If pdfUrl is a Cloudinary URL, redirect to it
    if (certificate.pdfUrl.startsWith("http")) {
      res.redirect(certificate.pdfUrl);
      return;
    }

    // If it's a local file path
    const filePath = path.resolve(certificate.pdfUrl);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        error: "Certificate file not found",
      });
      return;
    }

    res.download(filePath, `certificate-${certificate._id}.pdf`, (err) => {
      if (err) {
        console.error("Error downloading certificate:", err);
        res.status(500).json({
          success: false,
          error: "Error downloading certificate",
        });
      }
    });
  }
);

// ==============================
// VERIFY CERTIFICATE (Public)
// ==============================
export const verifyCertificate = asyncHandler(
  async (req: Request, res: Response) => {
    const certificate = await Certificate.findById(req.params.id)
      .populate("studentId", "firstName lastName")
      .populate("courseId programId", "title");

    if (!certificate) {
      res.status(404).json({
        success: false,
        error: "Certificate not found",
      });
      return;
    }

    // Return verification info
    res.status(200).json({
      success: true,
      data: {
        isValid: certificate.status === "issued",
        status: certificate.status,
        studentName: certificate.studentName,
        courseName: certificate.courseName,
        programName: certificate.programName,
        completionDate: certificate.completionDate,
        grade: certificate.grade,
        finalScore: certificate.finalScore,
        metadata: certificate.metadata,
      },
    });
  }
);


// ==============================
// UPLOAD CERTIFICATE HTML TO CLOUDINARY
// ==============================
export const uploadCertificateHtml = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { htmlContent, studentName } = req.body;
  if (!htmlContent) return res.status(400).json({ success: false, error: "htmlContent is required" });

  try {
    const buffer = Buffer.from(htmlContent, "utf-8");
    const safeName = (studentName || "certificate").replace(/\s+/g, "-").toLowerCase();
    const folder   = "certificates";

    const { fileUrl } = await uploadDocumentToCloudinary(buffer, folder, "text/html");

    return res.status(200).json({ success: true, data: { pdfUrl: fileUrl } });
  } catch (err: any) {
    console.error("Certificate HTML upload error:", err);
    return res.status(500).json({ success: false, error: "Failed to upload certificate" });
  }
});