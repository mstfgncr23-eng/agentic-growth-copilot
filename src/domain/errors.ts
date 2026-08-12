export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, event: string) {
    super(
      "INVALID_RUN_TRANSITION",
      `Run cannot handle ${event} while it is ${from}.`,
    );
  }
}

export class RunInvariantError extends DomainError {
  constructor(message: string) {
    super("RUN_INVARIANT_VIOLATION", message);
  }
}

export class ApprovalConflictError extends DomainError {
  constructor(message = "This approval has already been decided.") {
    super("APPROVAL_CONFLICT", message);
  }
}

export class PersistenceConflictError extends DomainError {
  constructor(message = "The record changed before this update was applied.") {
    super("PERSISTENCE_CONFLICT", message, true);
  }
}

export class EntityNotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super("ENTITY_NOT_FOUND", `${entity} ${id} was not found.`);
  }
}

export class IdempotencyMismatchError extends DomainError {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      "The idempotency key was already used with a different request.",
    );
  }
}

export class SimulatedTransientError extends DomainError {
  constructor(stepKey: string) {
    super(
      "SIMULATED_TRANSIENT_FAILURE",
      `The demo intentionally failed once at ${stepKey}. Retry resumes from this checkpoint.`,
      true,
    );
  }
}

export class ModelConfigurationError extends DomainError {
  constructor(message: string) {
    super("MODEL_CONFIGURATION_INVALID", message);
  }
}

export class ModelOutputError extends DomainError {
  constructor(message: string) {
    super("MODEL_OUTPUT_INVALID", message);
  }
}

export class ModelProviderError extends DomainError {
  constructor() {
    super(
      "MODEL_PROVIDER_ERROR",
      "The model provider could not complete the request.",
      true,
    );
  }
}
