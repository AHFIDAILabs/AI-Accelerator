import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Submission, SubmissionStatus } from "../models/Submission";

// services/progress.service.ts
export const updateCourseProgress = async (
studentId: string, courseId?: string, res?: unknown): Promise<void> => {
  if (!courseId) return;

  const enrollment = await Enrollment.findOne({
    studentId,
    "coursesProgress.course": courseId
  });

  if (!enrollment) return;

  const courseProgress = enrollment.coursesProgress.find(
    c => c.course.toString() === courseId
  );

  if (!courseProgress) return;

  const gradedCount = await Submission.countDocuments({
    studentId,
    courseId,
    status: SubmissionStatus.GRADED
  });

  courseProgress.lessonsCompleted = gradedCount;

  if (gradedCount >= courseProgress.totalLessons) {
    courseProgress.status = EnrollmentStatus.COMPLETED;
    courseProgress.completionDate = new Date();
  }

  await enrollment.save();
};
