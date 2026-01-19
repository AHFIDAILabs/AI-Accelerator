export class Logger {
  static info(message: string, meta?: any): void {
    console.log(`ℹ️  [INFO] ${message}`, meta || '');
  }

  static success(message: string, meta?: any): void {
    console.log(`✅ [SUCCESS] ${message}`, meta || '');
  }

  static warning(message: string, meta?: any): void {
    console.warn(`⚠️  [WARNING] ${message}`, meta || '');
  }

  static error(message: string, error?: any): void {
    console.error(`❌ [ERROR] ${message}`, error || '');
  }

  static debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 [DEBUG] ${message}`, meta || '');
    }
  }
}