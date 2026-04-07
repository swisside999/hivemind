import { EventEmitter } from "node:events";
import { v4 as uuid } from "uuid";
import { logger } from "../utils/logger.js";
import type { AgentMessage, EscalationRequest, EscalationOption } from "./types.js";

const SCOPE = "EscalationManager";

export interface EscalationEvents {
  escalation: [EscalationRequest];
  resolved: [EscalationRequest];
}

export class EscalationManager extends EventEmitter<EscalationEvents> {
  private pending = new Map<string, EscalationRequest>();

  createEscalation(message: AgentMessage): EscalationRequest {
    const escalation: EscalationRequest = {
      id: uuid(),
      from: message.from,
      message,
      options: this.buildDefaultOptions(message),
    };

    this.pending.set(escalation.id, escalation);
    logger.info(SCOPE, `New escalation from ${message.from}: ${message.subject}`);
    this.emit("escalation", escalation);
    return escalation;
  }

  resolve(escalationId: string, resolution: string): EscalationRequest | null {
    const escalation = this.pending.get(escalationId);
    if (!escalation) {
      logger.warn(SCOPE, `Escalation not found: ${escalationId}`);
      return null;
    }

    escalation.resolvedAt = new Date().toISOString();
    escalation.resolution = resolution;
    this.pending.delete(escalationId);

    logger.info(SCOPE, `Escalation resolved: ${escalationId} → ${resolution}`);
    this.emit("resolved", escalation);
    return escalation;
  }

  getPending(): EscalationRequest[] {
    return Array.from(this.pending.values());
  }

  getEscalation(id: string): EscalationRequest | undefined {
    return this.pending.get(id);
  }

  clearAll(): void {
    this.pending.clear();
  }

  private buildDefaultOptions(message: AgentMessage): EscalationOption[] {
    if (message.type === "review_request") {
      return [
        { label: "Approve", value: "approve", description: "Approve as-is" },
        { label: "Request Changes", value: "request_changes", description: "Send back for revision" },
        { label: "Discuss", value: "discuss", description: "Open a discussion" },
      ];
    }

    return [
      { label: "Approve", value: "approve" },
      { label: "Reject", value: "reject" },
      { label: "Discuss", value: "discuss" },
    ];
  }
}
