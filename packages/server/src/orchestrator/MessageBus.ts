import { EventEmitter } from "node:events";
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger.js";
import type { AgentMessage, MessageType, MessagePriority } from "./types.js";

const SCOPE = "MessageBus";

export interface MessageBusEvents {
  message: [AgentMessage];
  "message:routed": [AgentMessage];
  "message:broadcast": [AgentMessage];
  "message:user": [AgentMessage];
}

export interface SendMessageParams {
  from: string;
  to: string;
  type: MessageType;
  priority?: MessagePriority;
  subject: string;
  body: string;
  context?: Record<string, unknown>;
  requiresResponse?: boolean;
  parentMessageId?: string;
}

export class MessageBus extends EventEmitter<MessageBusEvents> {
  private messageLog: AgentMessage[] = [];

  send(params: SendMessageParams): AgentMessage {
    const message: AgentMessage = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      from: params.from,
      to: params.to,
      type: params.type,
      priority: params.priority ?? "normal",
      subject: params.subject,
      body: params.body,
      context: params.context,
      requiresResponse: params.requiresResponse ?? false,
      parentMessageId: params.parentMessageId,
    };

    this.messageLog.push(message);
    logger.debug(SCOPE, `[${message.from} → ${message.to}] ${message.type}: ${message.subject}`);

    this.emit("message", message);

    if (message.to === "broadcast") {
      this.emit("message:broadcast", message);
    } else if (message.to === "user") {
      this.emit("message:user", message);
    } else {
      this.emit("message:routed", message);
    }

    return message;
  }

  routeExistingMessage(message: AgentMessage): void {
    if (!message.id) {
      message.id = uuid();
    }
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    this.messageLog.push(message);
    logger.debug(SCOPE, `Routing existing: [${message.from} → ${message.to}] ${message.type}: ${message.subject}`);

    this.emit("message", message);

    if (message.to === "broadcast") {
      this.emit("message:broadcast", message);
    } else if (message.to === "user") {
      this.emit("message:user", message);
    } else {
      this.emit("message:routed", message);
    }
  }

  getLog(): readonly AgentMessage[] {
    return this.messageLog;
  }

  getMessagesFor(agentName: string): AgentMessage[] {
    return this.messageLog.filter(
      (m) => m.to === agentName || m.from === agentName || m.to === "broadcast"
    );
  }

  getThread(messageId: string): AgentMessage[] {
    const thread: AgentMessage[] = [];
    const rootMessage = this.messageLog.find((m) => m.id === messageId);
    if (!rootMessage) return thread;

    thread.push(rootMessage);

    const replies = this.messageLog.filter((m) => m.parentMessageId === messageId);
    for (const reply of replies) {
      thread.push(reply);
      thread.push(...this.getThread(reply.id));
    }

    return thread;
  }

  clear(): void {
    this.messageLog = [];
  }
}
