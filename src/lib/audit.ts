import { db } from "./db";
import { Prisma } from "@/generated/prisma/client";

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "user_created"
  | "user_updated"
  | "user_disabled"
  | "user_enabled"
  | "role_changed"
  | "password_changed"
  | "settings_modified"
  | "integration_connected"
  | "integration_disconnected"
  | "blog_created"
  | "blog_published"
  | "blog_deleted"
  | "product_modified"
  | "coupon_created"
  | "coupon_edited"
  | "task_created"
  | "task_deleted"
  | "session_started"
  | "session_ended"
  | "team_rotated"
  | "team_member_assigned"
  | "team_lead_set";

export async function logAudit(
  action: AuditAction,
  actorId: string | null,
  entity?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        actorId,
        entity: entity || null,
        entityId: entityId || null,
        metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch {
    // Audit logging should never break the main flow
    console.error("Audit log failed:", action, entity);
  }
}
