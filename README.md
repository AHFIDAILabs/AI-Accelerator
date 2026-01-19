<<<<<<< HEAD
# AI Accelerator Backend

Backend API for the AI Accelerator Learning Management System.

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- MongoDB >= 6.0
- npm >= 9.0.0

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ai-accelerator-backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start MongoDB
```bash
# If using local MongoDB
mongod
```

5. Run the development server
```bash
npm run dev
```

The server will start at `http://localhost:5000`

## 📁 Project Structure

```
ai-accelerator-backend/
├── src/
│   ├── models/          # Mongoose models
│   ├── controllers/     # Route controllers
│   ├── routes/          # API routes
│   ├── middleware/      # Custom middleware
│   ├── utils/           # Utility functions
│   ├── config/          # Configuration files
│   └── index.ts         # Entry point
├── uploads/             # File uploads
├── dist/                # Compiled TypeScript
├── .env                 # Environment variables
├── tsconfig.json        # TypeScript config
└── package.json
```

## 🛠️ Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run seed` - Seed database with sample data
- `npm run seed:admin` - Create admin user

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

#### Courses
- `GET /api/courses` - Get all courses
- `POST /api/courses` - Create course (Admin)
- `GET /api/courses/:id` - Get course by ID
- `PUT /api/courses/:id` - Update course (Admin)
- `DELETE /api/courses/:id` - Delete course (Admin)

#### More endpoints...

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_token>
```

## 🗄️ Database Models

- User (Admin & Students)
- Course
- Module
- Lesson
- Assessment
- Submission
- Progress
- Certificate
- Enrollment
- Notification

## 📝 License

MIT
=======
# AI-Accelerator
>>>>>>> dbc7a7a7001f34551f4c40a87288a27bcd64f190
