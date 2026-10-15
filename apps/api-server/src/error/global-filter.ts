import { Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';
import { AppError } from './app-error';
import { StandardResponse } from '@api-interfaces';

/**
 * Global exception filter for handling all unhandled exceptions across the application.
 * It catches various types of exceptions (HttpException, AppError, and others)
 * and formats the response according to RFC 7807 Problem Details for AppError instances.
 *
 * @category Errors
 * @since 1.0.0
 */
@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();

    let status: number;
    let note: string;
    let errorData: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= 500) {
        note = 'An internal server error occurred.';
        errorData = { message: note };
      } else if (typeof exceptionResponse === 'string') {
        note = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        note =
          responseObj.message || responseObj.detail || exception.message || 'The request could not be processed.';
        if (responseObj.detail || responseObj.message) {
          errorData = { message: responseObj.message || responseObj.detail };
        }
      } else {
        note = exception.message || 'The request could not be processed.';
      }

      this.logger.error(
        `HTTP Exception [${status}]: ${exception.message}`,
        exception.stack,
        `${req.method} ${req.url}`
      );
    } else if (exception instanceof AppError) {
      const problemDetails = exception.toProblemDetails(req.url);

      status = problemDetails.status;
      note =
        problemDetails.detail || problemDetails.title || exception.message || 'An error occurred';

      errorData = {
        // Spread first: carries any extra client-safe fields toProblemDetails
        // computed (e.g. dbname, missingFields — see AppError.getSafeFieldsForClient)
        // that hand-picking just code/type/title/detail previously dropped on
        // the floor, silently, for every AppError with additionalData.
        ...problemDetails,
        /** Same text as top-level `note` — clients that read `data.message` / `data.detail` (e.g. Problem Details) */
        message: note,
        detail: note,
      };

      const logDetails = exception.toLogDetails(req.url);
      this.logger.error(
        `App Error [${exception.kind}:${exception.code}]: ${exception.message}`,
        JSON.stringify(logDetails, null, 2),
        `${req.method} ${req.url}`
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      // Do not expose raw internal exception messages to clients
      note = 'An internal server error occurred.';

      this.logger.error(
        `Unhandled Error: ${exception?.message || 'No message'}`,
        exception?.stack || 'No stack trace',
        `${req.method} ${req.url}`
      );
    }

    const standardResponse: StandardResponse = {
      data: errorData,
      status: status,
      note: note,
    };

    res.status(status).json(standardResponse);
  }
}
