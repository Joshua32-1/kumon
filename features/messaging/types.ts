export interface MessageResult {
  success: boolean
  provider: string
  message_id?: string
  error?: string
}

export interface TemplateParameter {
  type: "text"
  text: string
  parameter_name?: string
}

export interface TemplateComponent {
  type: "body" | "header" | "button"
  parameters: TemplateParameter[]
  sub_type?: string
  index?: number
}

export interface MessagingProvider {
  send(to: string, message: string): Promise<MessageResult>
  sendTemplate?(
    to: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[]
  ): Promise<MessageResult>
}
