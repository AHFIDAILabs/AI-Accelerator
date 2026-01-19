export class ApiResponse {
  static success(data: any, message: string = 'Success', statusCode: number = 200) {
    return {
      success: true,
      statusCode,
      message,
      data,
    };
  }

  static error(message: string = 'Error', statusCode: number = 500, errors?: any) {
    return {
      success: false,
      statusCode,
      message,
      ...(errors && { errors }),
    };
  }

  static paginated(data: any[], page: number, limit: number, total: number) {
    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}