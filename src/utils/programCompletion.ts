import { Program } from "../models/program";
import { isCourseCompleted } from "./courseCompletion";

export const isProgramCompleted = async (studentId: string, programId: string) => {
  const program = await Program.findById(programId).populate("courses");
  if (!program) return false;

  for (const course of program.courses as any[]) {
    const completed = await isCourseCompleted(studentId, course._id);
    if (!completed) return false;
  }

  return true;
};
