import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const details =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : {};
    const rawMessage = details.message;
    const body: ErrorBody = {
      statusCode: status,
      code:
        typeof details.error === 'string'
          ? details.error.toUpperCase().replaceAll(' ', '_')
          : (HttpStatus[status] ?? 'ERROR'),
      message:
        typeof rawMessage === 'string' || Array.isArray(rawMessage)
          ? (rawMessage as string | string[])
          : exception instanceof Error
            ? exception.message
            : 'Internal server error',
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }
}
