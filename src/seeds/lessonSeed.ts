import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Module } from '../models/Module';
import { Lesson, LessonType } from '../models/Lesson';
import { Program } from '../models/program'; 
import { Course } from '../models/Course';  


dotenv.config();

const seedLessons = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string);

    // ✅ FORCE REGISTER MODELS (This stops the MissingSchemaError for good)
    if (!mongoose.models.Course) {
        mongoose.model('Course', Course.schema);
    }
    if (!mongoose.models.Module) {
        mongoose.model('Module', Module.schema);
    }

    // 2. Get all modules
    // Use the model directly to populate
    const modules = await Module.find().populate({
        path: 'course',
        model: 'Course' // ✅ Explicitly tell Mongoose which model to use
    });

    if (modules.length === 0) {
      console.error('❌ No modules found. Run moduleSeed.ts first.');
      process.exit(1);
    }

    console.log(`Found ${modules.length} modules. Seeding lessons...`);

    for (const module of modules) {
      const lessonsToCreate = [
        {
          module: module._id,
          order: 1,
          title: `Introduction to ${module.title}`,
          description: 'A comprehensive overview of what we will cover in this module.',
          type: LessonType.VIDEO,
          estimatedMinutes: 15,
          content: 'In this lesson, we dive deep into the core theories...',
          learningObjectives: ['Define key terms', 'Identify core components'],
          isPreview: true, // Let students see the first lesson for free
          isPublished: true,
          isRequired: true,
          completionRule: { type: 'view' }
        },
        {
          module: module._id,
          order: 2,
          title: 'Hands-on Technical Lab',
          description: 'Practical exercise to apply the concepts learned in the previous video.',
          type: LessonType.CODING,
          estimatedMinutes: 45,
          content: 'Follow these steps to configure your environment...',
          codeExamples: ['npm install dspl-tools', 'import { analyzer } from "dspl"'],
          isPublished: true,
          isRequired: true,
          completionRule: { type: 'view' }
        },
        {
          module: module._id,
          order: 3,
          title: 'Module Deep-Dive Reading',
          description: 'Supplementary material for theoretical mastery.',
          type: LessonType.READING,
          estimatedMinutes: 20,
          content: 'Historical context of these methodologies dates back to...',
          isPublished: true,
          isRequired: true,
          completionRule: { type: 'view' }
        }
      ];

      // Clear existing lessons for this module to avoid duplicates
      await Lesson.deleteMany({ module: module._id });
      
      const createdLessons = await Lesson.insertMany(lessonsToCreate);
      console.log(`✅ Seeded ${createdLessons.length} lessons for module: ${module.title}`);
    }

    console.log('\n🚀 Curriculum Full Stack Seeded Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding lessons:', error);
    process.exit(1);
  }
};

seedLessons();