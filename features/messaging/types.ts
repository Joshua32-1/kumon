export interface MessageResult {
  success: boolean
  provider: string
  message_id?: string
  error?: string
}

export interface MessagingProvider {
  send(to: string, message: string): Promise<MessageResult>
}
