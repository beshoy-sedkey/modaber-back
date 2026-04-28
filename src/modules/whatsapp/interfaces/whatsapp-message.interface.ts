// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Business API — TypeScript interfaces for Meta Cloud API payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatsAppTextMessage {
  readonly body: string;
  readonly preview_url?: boolean;
}

export interface WhatsAppTemplateLanguage {
  readonly code: string;
}

export interface WhatsAppTemplateParameter {
  readonly type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  readonly text?: string;
  readonly currency?: {
    readonly fallback_value: string;
    readonly code: string;
    readonly amount_1000: number;
  };
}

export interface WhatsAppTemplateComponent {
  readonly type: 'header' | 'body' | 'button';
  readonly sub_type?: 'quick_reply' | 'url';
  readonly index?: string;
  readonly parameters: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplate {
  readonly name: string;
  readonly language: WhatsAppTemplateLanguage;
  readonly components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppInteractiveButton {
  readonly type: 'reply';
  readonly reply: {
    readonly id: string;
    readonly title: string;
  };
}

export interface WhatsAppInteractiveRow {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

export interface WhatsAppInteractiveSection {
  readonly title?: string;
  readonly rows: WhatsAppInteractiveRow[];
}

export interface WhatsAppInteractive {
  readonly type: 'button' | 'list';
  readonly header?: {
    readonly type: 'text';
    readonly text: string;
  };
  readonly body: {
    readonly text: string;
  };
  readonly footer?: {
    readonly text: string;
  };
  readonly action: {
    readonly buttons?: WhatsAppInteractiveButton[];
    readonly button?: string;
    readonly sections?: WhatsAppInteractiveSection[];
  };
}

export interface WhatsAppSendRequest {
  readonly messaging_product: 'whatsapp';
  readonly recipient_type: 'individual';
  readonly to: string;
  readonly type: 'text' | 'template' | 'interactive';
  readonly text?: WhatsAppTextMessage;
  readonly template?: WhatsAppTemplate;
  readonly interactive?: WhatsAppInteractive;
}

export interface WhatsAppSendResponse {
  readonly messaging_product: string;
  readonly contacts: Array<{
    readonly input: string;
    readonly wa_id: string;
  }>;
  readonly messages: Array<{
    readonly id: string;
  }>;
}

// ── Incoming webhook payloads ─────────────────────────────────────────────────

export interface WhatsAppIncomingTextMessage {
  readonly body: string;
}

export interface WhatsAppIncomingButtonReply {
  readonly id: string;
  readonly title: string;
}

export interface WhatsAppIncomingInteractiveMessage {
  readonly type: 'button_reply' | 'list_reply';
  readonly button_reply?: WhatsAppIncomingButtonReply;
  readonly list_reply?: WhatsAppIncomingButtonReply;
}

export interface WhatsAppIncomingMessage {
  readonly from: string;
  readonly id: string;
  readonly timestamp: string;
  readonly type: string;
  readonly text?: WhatsAppIncomingTextMessage;
  readonly interactive?: WhatsAppIncomingInteractiveMessage;
}

export interface WhatsAppContact {
  readonly profile: { readonly name: string };
  readonly wa_id: string;
}

export interface WhatsAppValue {
  readonly messaging_product: string;
  readonly metadata: {
    readonly display_phone_number: string;
    readonly phone_number_id: string;
  };
  readonly contacts?: WhatsAppContact[];
  readonly messages?: WhatsAppIncomingMessage[];
  readonly statuses?: Array<{
    readonly id: string;
    readonly status: string;
    readonly timestamp: string;
    readonly recipient_id: string;
  }>;
}

export interface WhatsAppWebhookChange {
  readonly value: WhatsAppValue;
  readonly field: string;
}

export interface WhatsAppWebhookEntry {
  readonly id: string;
  readonly changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookPayload {
  readonly object: string;
  readonly entry: WhatsAppWebhookEntry[];
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface WhatsAppMessageReceivedEvent {
  readonly merchantId: string;
  readonly configId: string;
  readonly from: string;
  readonly messageId: string;
  readonly messageType: string;
  readonly content: string;
  readonly timestamp: Date;
  readonly rawPayload: WhatsAppWebhookPayload;
}
