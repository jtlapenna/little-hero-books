// ⚠️ PLACEHOLDER FILE - Developer A must implement this properly
// This is a temporary placeholder to allow the build to succeed

import { NextResponse } from "next/server";

export enum ErrorType {
  VALIDATION = "validation",
  NOT_FOUND = "not_found",
  SERVER = "server_error",
  UNAUTHORIZED = "unauthorized",
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export function createValidationError(message: string): NextResponse {
  return NextResponse.json(
    { error: { type: ErrorType.VALIDATION, message } },
    { status: 400 }
  );
}

export function createNotFoundError(message: string = "Resource not found"): NextResponse {
  return NextResponse.json(
    { error: { type: ErrorType.NOT_FOUND, message } },
    { status: 404 }
  );
}

export function errorHandler(error: any, severity: ErrorSeverity = ErrorSeverity.MEDIUM) {
  console.error(`[${severity}]`, error);
  return {
    message: error.message || "An error occurred",
    severity,
    timestamp: new Date().toISOString(),
  };
}

