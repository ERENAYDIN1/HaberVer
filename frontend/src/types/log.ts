export const LOG_ACTIONS = [
  "asset_created",
  "asset_updated",
  "asset_status_changed",
  "asset_deleted",
  "report_approved",
  "report_rejected",
  "user_created",
  "assignment_created",
  "assignment_completed",
  "assignment_cancelled",
] as const;

export type LogAction = (typeof LOG_ACTIONS)[number];

export const LOG_ACTION_LABELS: Record<LogAction, string> = {
  asset_created: "Varlık eklendi",
  asset_updated: "Varlık güncellendi",
  asset_status_changed: "Durum değişti",
  asset_deleted: "Varlık silindi",
  report_approved: "İhbar onaylandı",
  report_rejected: "İhbar reddedildi",
  user_created: "Personel eklendi",
  assignment_created: "Göreve atandı",
  assignment_completed: "Görev tamamlandı",
  assignment_cancelled: "Görev havuza alındı",
};

export interface LogEntry {
  id: string;
  action: LogAction;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  detail: string | null;
  created_at: string;
}
