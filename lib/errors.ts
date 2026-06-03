export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message)
    this.name = "AppError"
  }
}

export const Errors = {
  STUDENT_NOT_FOUND: () => new AppError("STUDENT_NOT_FOUND", "Student not found", 404),
  CONTACT_NOT_FOUND: () => new AppError("CONTACT_NOT_FOUND", "Contact not found", 404),
  INVOICE_NOT_FOUND: () => new AppError("INVOICE_NOT_FOUND", "Invoice not found", 404),
  INVOICE_EXISTS: () =>
    new AppError("INVOICE_EXISTS", "Invoice already exists for this period", 409),
  LEAVE_EXISTS: () =>
    new AppError("LEAVE_EXISTS", "Leave already set for this month", 409),
  LEAVE_NOT_FOUND: () => new AppError("LEAVE_NOT_FOUND", "Leave record not found", 404),
  INVALID_STATUS: () => new AppError("INVALID_STATUS", "Invalid status transition"),
  WEBHOOK_INVALID: () =>
    new AppError("WEBHOOK_INVALID", "Invalid webhook signature", 401),
  UNAUTHORIZED: () => new AppError("UNAUTHORIZED", "Unauthorized", 401),
  INTERNAL: (msg = "Internal server error") =>
    new AppError("INTERNAL_ERROR", msg, 500),
} as const
