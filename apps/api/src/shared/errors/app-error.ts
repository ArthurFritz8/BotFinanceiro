export interface AppErrorOptions {
  code: string;
  details?: unknown;
  message: string;
  statusCode: number;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  public readonly statusCode: number;

  public constructor(options: AppErrorOptions) {
    super(options.message);

    this.name = "AppError";
    this.code = options.code;
    this.details = options.details;
    this.statusCode = options.statusCode;
  }
}