// Spaced repetition: an SM-2-lite scheduler so learners keep what they've met, not just meet it once.
// Pure and tested (tests/review.test.mjs); the page (08-you.js) seeds a deck from the glossary terms a learner
// has encountered and renders the cards. Everything is client-side: a card's schedule lives in P.review.

// A day number: whole local days, so due dates are plain integers that compare simply and roll over at midnight.
export const dayNum = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

const clampEase = e => Math.min(3, Math.max(1.3, e));

// A brand-new card is due today with no history.
export const freshCard = (today = dayNum()) => ({ e: 2.5, i: 0, due: today, reps: 0 });

// Grade a card and get its next state. grade: "again" (forgot), "good" (recalled), "easy" (knew it instantly).
// Again sends it back to today and lowers ease; good and easy push the next review further out (SM-2-lite).
export function schedule(card, grade, today = dayNum()) {
  let e = clampEase(Number(card?.e) || 2.5), i = Math.max(0, Math.round(Number(card?.i) || 0)), reps = Math.max(0, Math.round(Number(card?.reps) || 0));
  if (grade === "again") { e = clampEase(e - 0.2); i = 0; reps = 0; }
  else if (grade === "easy") { i = reps === 0 ? 3 : Math.round((i || 1) * e * 1.3); e = clampEase(e + 0.15); reps += 1; }
  else { i = reps === 0 ? 1 : reps === 1 ? 3 : Math.round((i || 1) * e); reps += 1; } // "good"
  i = Math.min(365, Math.max(0, i));
  return { e: Math.round(e * 100) / 100, i, due: today + i, reps };
}

// Which of `ids` are due now: cards with no saved state (new), plus saved cards due on or before today.
// Order: the most overdue first, then new cards, so a session clears the backlog before adding more.
export function dueCards(ids, review = {}, today = dayNum()) {
  const due = ids.filter(id => review[id] && review[id].due <= today).sort((a, b) => review[a].due - review[b].due);
  const fresh = ids.filter(id => !review[id]);
  return [...due, ...fresh];
}

// Counts for the dashboard: how many are due now, how many are new, and the whole deck size.
export function deckStats(ids, review = {}, today = dayNum()) {
  const due = dueCards(ids, review, today);
  const fresh = ids.filter(id => !review[id]).length;
  return { total: ids.length, due: due.length, fresh, learning: ids.length - fresh };
}

// The day number of the next scheduled review (or null if nothing is scheduled ahead of today).
export function nextDue(ids, review = {}, today = dayNum()) {
  const ahead = ids.map(id => review[id]?.due).filter(d => typeof d === "number" && d > today);
  return ahead.length ? Math.min(...ahead) : null;
}
