// Shared Dutch labels for review management (pure constants — safe to import
// from both server routes and client components).

export const OUTCOME_NL: Record<string, string> = {
  pending: "In afwachting",
  removed: "Verwijderd door Google",
  still_up: "Nog online",
  rejected: "Afgewezen door Google",
};

/** English labels — the Telegram digests are Kerim's, the dashboard is the client's. */
export const OUTCOME_EN: Record<string, string> = {
  pending: "pending",
  removed: "removed by Google",
  still_up: "still online",
  rejected: "rejected by Google",
};

// Removal pipeline stages (the paid removal service).
export const STAGE_NL: Record<string, string> = {
  ready: "Klaar voor verwijdering",
  sent: "Verzonden naar verwijderaar",
  removed: "Verwijderd — te betalen",
  came_back: "Teruggekomen",
};

export const ACTION_LABELS: Record<string, string> = {
  reported: "Gerapporteerd bij Google",
  unreported: "Rapport ongedaan gemaakt",
  outcome_set: "Uitkomst bijgewerkt",
  followup_done: "Follow-up: opnieuw gecontroleerd",
  note_added: "Notitie toegevoegd",
  reply_posted: "Antwoord geplaatst",
  reply_deleted: "Antwoord verwijderd",
  created: "Review toegevoegd",
  removed: "Review verwijderd",
  merged: "Gekoppeld aan Google-review",
  removal_ready: "Klaar voor verwijdering gezet",
  removal_sent: "Verzonden naar verwijderaar",
  removal_paid: "Betaald aan verwijderaar",
  removal_cancelled: "Uit verwijderpijplijn gehaald",
  came_back: "Teruggekomen op Google",
  task_created: "Teamtaak aangemaakt",
  edited: "Review bewerkt (terug bovenaan)",
  auto_replied: "Automatisch bedankt",
  case_set: "Google-case toegevoegd",
  escalated: "Geëscaleerd bij Google",
};
