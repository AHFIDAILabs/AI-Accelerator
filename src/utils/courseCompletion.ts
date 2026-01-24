import { Submission, SubmissionStatus } from "../models/Submission";
import { Course } from "../models/Course";

export const isCourseCompleted = async (studentId: string, courseId: string) => {
  const course = await Course.findById(courseId);
  if (!course) return false;

  const submissions = await Submission.find({
    studentId,
    courseId,
    status: SubmissionStatus.GRADED
  });

  if (!submissions.length) return false;

  const avgScore =
    submissions.reduce((acc, s) => acc + s.percentage, 0) / submissions.length;

  const projectsCompleted = submissions.filter(s => s.percentage >= 50).length;

  return (
    avgScore >= course.completionCriteria.minimumQuizScore &&
    projectsCompleted >= course.completionCriteria.requiredProjects
  );
};
