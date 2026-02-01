import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Course } from '../models/Course';
import { Module } from '../models/Module';
import { Program } from '../models/program';

dotenv.config();

const seedModules = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string);
    try {
      await mongoose.connection.collection('modules').dropIndex('courseId_1_moduleNumber_1');
      console.log('Successfully dropped old index.');
    } catch (e) {
      console.log('Old index not found or already dropped, proceeding...');
    }

    // 1. Find the Program first
    const program = await Program.findOne({ slug: 'data-science-professional' });
    if (!program) {
      console.error('❌ Program not found. Run programSeed.ts first.');
      process.exit(1);
    }

    // 2. Find all courses belonging to this program
    const courses = await Course.find({ program: program._id });
    if (courses.length === 0) {
      console.error('❌ No courses found for this program. Run courseSeed.ts first.');
      process.exit(1);
    }

    console.log(`Found ${courses.length} courses. Seeding modules...`);

    for (const course of courses) {
      // 3. Define 3 modules for each course
      const modulesToCreate = [
        {
          course: course._id,
          order: 1,
          sequenceLabel: 'Week 1',
          title: `Foundations of ${course.title.split(' ').slice(-1)}`,
          description: 'Getting started with the core concepts and setting up your environment.',
          learningObjectives: ['Understand the basics', 'Setup tools', 'First simple project'],
          estimatedMinutes: 120,
          type: 'core',
          isPublished: true,
        },
        {
          course: course._id,
          order: 2,
          sequenceLabel: 'Week 2',
          title: 'Advanced Techniques',
          description: 'Deep dive into practical implementation and complex scenarios.',
          learningObjectives: ['Optimizing performance', 'Error handling', 'Best practices'],
          estimatedMinutes: 180,
          type: 'core',
          isPublished: true,
        },
        {
          course: course._id,
          order: 3,
          sequenceLabel: 'Final Week',
          title: 'Capstone Project',
          description: 'Apply everything you have learned in a real-world project.',
          learningObjectives: ['Portfolio building', 'Problem solving', 'Final assessment'],
          estimatedMinutes: 300,
          type: 'project',
          isPublished: true,
        }
      ];

      // Clear existing modules for this course to avoid duplicates
      await Module.deleteMany({ course: course._id });
      
      const createdModules = await Module.insertMany(modulesToCreate);
      console.log(`✅ Seeded ${createdModules.length} modules for course: ${course.title}`);
    }

    console.log('\n🌟 All modules seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding modules:', error);
    process.exit(1);
  }
};

seedModules();