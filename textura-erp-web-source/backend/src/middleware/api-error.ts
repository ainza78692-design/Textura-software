export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "API_ERROR"
  ) {
    super(message);
  }
}
