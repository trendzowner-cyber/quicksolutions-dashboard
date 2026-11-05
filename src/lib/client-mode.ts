// Who gets the client interface.
//
// Azedine is the client: the one person who wants "is today done" and a way to
// hand over work, not a dashboard. This is deliberately NOT `role === "viewer"`
// — the six-person review team (Steven, Rob, Nacer, Reza, Elias, and Azedine
// himself) are all viewers, and the other five need their swipe deck exactly as
// it is. A role check here would have swapped the whole review team's interface
// for the client one.
//
// Keyed on the user id because that is what the session cookie carries. The
// email sits next to it so the constant stays readable and greppable; adding a
// second client later means adding to both lists.
//
// This module must stay import-free: it is read by auth.ts, the dashboard
// layout and two API routes, and anything with a dependency here risks a cycle.

export const CLIENT_USER_IDS = ["41f103ae-a29b-478d-8950-99efbdd8d4ed"];

export const CLIENT_EMAILS = ["azedine@quicksolutionspro.be"];

/** Is this signed-in user the client? No database round-trip. */
export function isClientUserId(userId?: string | null): boolean {
  return !!userId && CLIENT_USER_IDS.includes(userId);
}
