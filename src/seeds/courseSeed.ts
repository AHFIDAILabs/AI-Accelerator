import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Program } from '../models/program';
import { Course } from '../models/Course';
import { User } from '../models/user';

dotenv.config();

const seedCourses = async () => {
  try {
    console.log('🚀 Starting course seeding process...\n');
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    // Find admin or instructor user
    const user = await User.findOne({ role: { $in: ['admin', 'instructor'] } });
    if (!user) {
      console.error('❌ No Admin or Instructor found.');
      console.log('💡 Please create an admin or instructor user first.\n');
      process.exit(1);
    }
    console.log(`👤 Using user: ${user.firstName} ${user.lastName} (${user.role})\n`);

    // Define comprehensive course data mapped by program slug
    const coursesByProgram: Record<string, any[]> = {
      'ai-accelerator-program': [
        {
          title: 'Neural Networks 101',
          slug: 'neural-networks-101',
          hours: 40,
          description: 'Master the fundamentals of neural networks, from basic perceptrons to deep learning architectures.',
          objectives: [
            'Understand neural network architecture and components',
            'Implement feedforward and backpropagation algorithms',
            'Build and train multi-layer neural networks',
            'Apply activation functions and optimization techniques',
            'Handle overfitting with regularization methods'
          ],
          prerequisites: ['Basic Python programming', 'Linear algebra fundamentals', 'Calculus basics'],
          targetAudience: 'Aspiring AI Engineers and Data Scientists',
          coverImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800'
        },
        {
          title: 'Natural Language Processing',
          slug: 'nlp-basics',
          hours: 50,
          description: 'Learn to process and analyze human language using cutting-edge NLP techniques and transformers.',
          objectives: [
            'Master tokenization and text preprocessing',
            'Build language models with RNNs and LSTMs',
            'Implement attention mechanisms and transformers',
            'Work with pre-trained models like BERT and GPT',
            'Create practical NLP applications'
          ],
          prerequisites: ['Neural Networks 101', 'Python programming', 'Basic statistics'],
          targetAudience: 'AI Engineers focusing on language processing',
          coverImage: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800'
        },
        {
          title: 'Computer Vision with PyTorch',
          slug: 'cv-pytorch',
          hours: 60,
          description: 'Build advanced computer vision systems using PyTorch, from image classification to object detection.',
          objectives: [
            'Understand convolutional neural networks (CNNs)',
            'Implement popular architectures (ResNet, VGG, YOLO)',
            'Master image preprocessing and augmentation',
            'Build object detection and segmentation models',
            'Deploy computer vision models to production'
          ],
          prerequisites: ['Neural Networks 101', 'Python and PyTorch basics'],
          targetAudience: 'AI Engineers specializing in computer vision',
          coverImage: 'https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800'
        }
      ],

      'full-stack-web-development': [
        {
          title: 'Advanced React Patterns',
          slug: 'advanced-react',
          hours: 30,
          description: 'Master advanced React patterns, hooks, and performance optimization techniques for production applications.',
          objectives: [
            'Implement advanced React hooks and custom hooks',
            'Master component composition patterns',
            'Optimize performance with memoization and lazy loading',
            'Build scalable state management solutions',
            'Create reusable component libraries'
          ],
          prerequisites: ['Basic React knowledge', 'JavaScript ES6+', 'HTML/CSS'],
          targetAudience: 'Frontend developers seeking advanced React skills',
          coverImage: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800'
        },
        {
          title: 'Node.js Backend Architecture',
          slug: 'node-backend',
          hours: 45,
          description: 'Design and build scalable backend systems with Node.js, Express, and modern architectural patterns.',
          objectives: [
            'Design RESTful and GraphQL APIs',
            'Implement authentication and authorization',
            'Build microservices architecture',
            'Master database design and ORMs',
            'Deploy and scale Node.js applications'
          ],
          prerequisites: ['JavaScript fundamentals', 'Basic backend concepts', 'HTTP protocol understanding'],
          targetAudience: 'Backend developers and full-stack engineers',
          coverImage: 'https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=800'
        },
        {
          title: 'Database Design & SQL',
          slug: 'db-design',
          hours: 25,
          description: 'Master relational database design, SQL optimization, and database administration best practices.',
          objectives: [
            'Design normalized database schemas',
            'Write complex SQL queries and joins',
            'Optimize query performance and indexing',
            'Understand transactions and ACID properties',
            'Implement database security best practices'
          ],
          prerequisites: ['Basic programming knowledge', 'Understanding of data structures'],
          targetAudience: 'Developers working with databases',
          coverImage: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800'
        }
      ],

      'mobile-app-development': [
        {
          title: 'React Native Fundamentals',
          slug: 'react-native-intro',
          hours: 35,
          description: 'Build cross-platform mobile applications with React Native, from basics to production-ready apps.',
          objectives: [
            'Master React Native core components',
            'Handle navigation and routing',
            'Integrate native device features',
            'Manage app state effectively',
            'Deploy to App Store and Play Store'
          ],
          prerequisites: ['React basics', 'JavaScript ES6+', 'Mobile app concepts'],
          targetAudience: 'Mobile developers and React developers',
          coverImage: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800'
        },
        {
          title: 'iOS Deployment with Xcode',
          slug: 'ios-deploy',
          hours: 20,
          description: 'Learn the complete iOS deployment process, from code signing to App Store submission.',
          objectives: [
            'Configure Xcode project settings',
            'Manage certificates and provisioning profiles',
            'Handle code signing and entitlements',
            'Submit apps to the App Store',
            'Implement TestFlight beta testing'
          ],
          prerequisites: ['Basic iOS development', 'Apple Developer account'],
          targetAudience: 'iOS developers preparing for deployment',
          coverImage: 'https://images.unsplash.com/photo-1621609764180-2ca554a9d6f2?w=800'
        },
        {
          title: 'Android Studio Mastery',
          slug: 'android-mastery',
          hours: 25,
          description: 'Master Android development with Android Studio, Kotlin, and modern Android architecture.',
          objectives: [
            'Build apps with Kotlin and Jetpack Compose',
            'Implement MVVM architecture',
            'Work with Android lifecycle and components',
            'Integrate Google Play services',
            'Publish to Google Play Store'
          ],
          prerequisites: ['Java or Kotlin basics', 'OOP concepts'],
          targetAudience: 'Android developers and mobile engineers',
          coverImage: 'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?w=800'
        }
      ],

      'data-science-professional': [
        {
          title: 'Python for Data Science',
          slug: 'intro-to-python-ds',
          hours: 20,
          description: 'Master Python programming for data science with NumPy, Pandas, and data visualization libraries.',
          objectives: [
            'Master NumPy for numerical computing',
            'Manipulate data with Pandas',
            'Create visualizations with Matplotlib and Seaborn',
            'Handle data cleaning and preprocessing',
            'Perform exploratory data analysis (EDA)'
          ],
          prerequisites: ['Basic programming concepts'],
          targetAudience: 'Aspiring data scientists and analysts',
          coverImage: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800'
        },
        {
          title: 'Statistical Inference',
          slug: 'statistical-inference',
          hours: 35,
          description: 'Learn statistical methods, hypothesis testing, and inference techniques for data-driven decisions.',
          objectives: [
            'Understand probability distributions',
            'Perform hypothesis testing',
            'Calculate confidence intervals',
            'Conduct regression analysis',
            'Apply Bayesian inference methods'
          ],
          prerequisites: ['Python for Data Science', 'Basic statistics'],
          targetAudience: 'Data scientists and analysts',
          coverImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800'
        },
        {
          title: 'ML Fundamentals',
          slug: 'machine-learning-basics',
          hours: 50,
          description: 'Build a strong foundation in machine learning algorithms, from linear regression to ensemble methods.',
          objectives: [
            'Implement supervised learning algorithms',
            'Master unsupervised learning techniques',
            'Understand model evaluation and validation',
            'Apply feature engineering techniques',
            'Build end-to-end ML pipelines'
          ],
          prerequisites: ['Python for Data Science', 'Statistical Inference'],
          targetAudience: 'Data scientists and ML engineers',
          coverImage: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800'
        }
      ]
    };

    console.log('🗑️  Clearing all existing courses...');
    const deletedCount = await Course.deleteMany({});
    console.log(`   Deleted ${deletedCount.deletedCount} courses\n`);

    const allPrograms = await Program.find({});
    console.log(`📚 Found ${allPrograms.length} programs to seed\n`);

    let totalCoursesCreated = 0;

    for (const program of allPrograms) {
      const courseTemplates = coursesByProgram[program.slug];

      if (courseTemplates) {
        console.log(`🌱 Seeding courses for: ${program.title}`);
        
        const coursesToInsert = courseTemplates.map((template, index) => ({
          program: program._id,
          order: index + 1,
          slug: template.slug,
          title: template.title,
          description: template.description || `Master ${template.title} as part of our ${program.title}.`,
          estimatedHours: template.hours,
          targetAudience: template.targetAudience || 'Aspiring Professionals',
          isPublished: true,
          approvalStatus: 'approved',
          createdBy: user._id,
          coverImage: template.coverImage || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
          objectives: template.objectives || [
            `Understand ${template.title}`,
            'Complete hands-on projects',
            'Apply industry best practices'
          ],
          prerequisites: template.prerequisites || [],
          completionCriteria: {
            minimumQuizScore: 70,
            requiredProjects: 3,
            capstoneRequired: true
          }
        }));

        const createdCourses = await Course.insertMany(coursesToInsert);
        totalCoursesCreated += createdCourses.length;
        
        // Link created courses back to the program
        program.courses = createdCourses.map(c => c._id as mongoose.Types.ObjectId);
        await program.save();
        
        console.log(`   ✅ Created ${createdCourses.length} courses`);
        createdCourses.forEach((course, idx) => {
          console.log(`      ${idx + 1}. ${course.title} (${course.slug})`);
        });
        console.log('');
      } else {
        console.log(`⚠️  No course templates found for: ${program.slug}\n`);
      }
    }

    console.log('='.repeat(60));
    console.log(`🎉 Course seeding completed successfully!`);
    console.log(`   📊 Total courses created: ${totalCoursesCreated}`);
    console.log(`   📚 Across ${allPrograms.length} programs`);
    console.log('='.repeat(60) + '\n');

    await mongoose.connection.close();
    console.log('👋 Database connection closed\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding courses:', error);
    
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      
      if (error.message.includes('ECONNREFUSED')) {
        console.log('\n💡 Troubleshooting tips:');
        console.log('   1. Make sure MongoDB is running');
        console.log('   2. Check your MONGODB_URI in .env file');
        console.log('   3. Verify the connection string is correct\n');
      }
    }
    
    process.exit(1);
  }
};

seedCourses();