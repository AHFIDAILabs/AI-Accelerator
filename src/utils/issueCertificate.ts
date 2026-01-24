import { Certificate, CertificateStatus } from "../models/Certificate";
import { User } from "../models/user";
import { pushNotification } from "../utils/pushNotification";
import { NotificationType } from "../models/Notification";
import { Program } from "../models/program";

export const handleProgramCompletion = async (studentId: string, programId: string) => {
  const alreadyIssued = await Certificate.findOne({ studentId, programId });
  if (alreadyIssued) return; // avoid duplicates

  const program = await Program.findById(programId);
  const student = await User.findById(studentId);
  const Admin = await User.findOne({ role: 'admin' });

  if (!program || !student || !Admin) return;

  const certificate = await Certificate.create({
    studentId,
    programId,
    status: CertificateStatus.ISSUED,
    studentName: `${student.firstName} ${student.lastName}`,
    programName: program.title,
    completionDate: new Date(),
    issuedBy: Admin._id || "Africa Hub For Innovation and Development", // or admin/system id
    metadata: {
      totalCourses: program.courses.length,
      coursesCompleted: program.courses.length
    }
  });

  await pushNotification({
    userId: student._id,
    type: NotificationType.CERTIFICATE_ISSUED,
    title: "Program Completed 🎉",
    message: `You’ve earned your certificate for ${program.title}!`,
    relatedId: certificate._id,
    relatedModel: "Certificate"
  });
};
