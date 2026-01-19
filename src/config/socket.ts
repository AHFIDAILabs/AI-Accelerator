import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server;

export const initSocket = (server: HTTPServer): Server => {
  if (io) return io; // Prevent re-initialization

  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket: Socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Join room by userId for targeted notifications
    socket.on("join", (userId: string) => {
      socket.join(userId);
      console.log(`👤 User ${userId} joined their room`);
    });

    // Leave room
    socket.on("leave", (userId: string) => {
      socket.leave(userId);
      console.log(`👋 User ${userId} left their room`);
    });

    // Mark notification as read
    socket.on("notification:read", (notificationId: string) => {
      console.log(`✓ Notification ${notificationId} marked as read`);
      // You can emit back to confirm
      socket.emit("notification:read:success", { notificationId });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on("error", (error) => {
      console.error(`🔴 Socket error for ${socket.id}:`, error);
    });
  });

  return io;
};

// Get io instance in controllers
export const getIo = (): Server => {
  if (!io) {
    throw new Error("Socket.io not initialized! Call initSocket first.");
  }
  return io;
};

// Helper to emit to specific user
export const emitToUser = (userId: string, event: string, data: any): void => {
  const io = getIo();
  io.to(userId).emit(event, data);
};

// Helper to emit to multiple users
export const emitToUsers = (userIds: string[], event: string, data: any): void => {
  const io = getIo();
  userIds.forEach(userId => {
    io.to(userId).emit(event, data);
  });
};

// Helper to broadcast to all connected clients
export const broadcastToAll = (event: string, data: any): void => {
  const io = getIo();
  io.emit(event, data);
};