import { z } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  requestId: z.string().min(1),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

type DomainErrorLike = {
  code: string;
  message: string;
  retryable: boolean;
};

function asDomainError(error: unknown): DomainErrorLike | null {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    "retryable" in error &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  ) {
    return {
      code: (error as { code: string }).code,
      message: (error as { message: string }).message,
      retryable: (error as { retryable: boolean }).retryable,
    };
  }

  return null;
}

export function toApiError(error: unknown, requestId: string): ApiError {
  const domainError = asDomainError(error);

  if (domainError) {
    return {
      code: domainError.code,
      message: domainError.message,
      retryable: domainError.retryable,
      requestId,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_REQUEST",
      message: "The request did not match the API contract.",
      retryable: false,
      requestId,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "The request could not be completed.",
    retryable: true,
    requestId,
  };
}

export function statusForApiError(error: unknown): number {
  if (error instanceof z.ZodError) return 400;

  const domainError = asDomainError(error);

  if (!domainError) return 500;

  switch (domainError.code) {
    case "ENTITY_NOT_FOUND":
      return 404;

    case "APPROVAL_CONFLICT":
    case "IDEMPOTENCY_KEY_REUSED":
    case "PERSISTENCE_CONFLICT":
      return 409;

    default:
      return 422;
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  return Response.json(
    { error: toApiError(error, requestId) },
    { status: statusForApiError(error) },
  );
}
