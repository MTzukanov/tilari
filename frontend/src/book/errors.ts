export class BookError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'BookError'
    this.status = status
  }
}

export class PostingError extends BookError {
  constructor(message: string, status = 400) {
    super(message, status)
    this.name = 'PostingError'
  }
}
