export class LLMError extends Error {
  constructor(message, { model = null, status = null } = {}) {
    super(message);
    this.name = 'LLMError';
    this.model = model;
    this.status = status;
  }
}

// Rate-limited after all retries, or the queue is full. Reported to the player as
// "the gatekeeper is busy" and logged as an error, never as an attempt result.
export class BusyError extends LLMError {
  constructor(message = 'busy', opts) {
    super(message, opts);
    this.name = 'BusyError';
  }
}
