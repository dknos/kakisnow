/**
 * The Burger Tour — which mountains a book has earned.
 *
 * Derived from the records every time it is asked, never stored: a stored
 * unlock can rot (a schema slip, an imported save), but records are ground
 * truth and the chain recomputes from them in microseconds. The book's own
 * `unlockedCourses` list still counts — as a manual override lane for QA and
 * for anything a future build grants directly — but the tour itself is a
 * pure function of what the player has actually done.
 *
 * The cadence is the brief's: finish the Summit to reach the forest, medal
 * in the forest to reach the ice, gather stars for the night park, and
 * finish every mountain's main delivery to face the storm. Requirements sit
 * deliberately low — better medals are for cosmetics and pride, not gates.
 */

/**
 * @param {object} book the BurgerBook's plain data (`book.book`)
 * @returns {Record<string, {unlocked: boolean, reason: string}>}
 */
export function tourState(book) {
    const ev = (id) => book.events?.[id] ?? {};
    const stars = Object.values(book.events ?? {})
        .reduce((sum, e) => sum + (e.bestStars ?? 0), 0);
    const done = (id) => (ev(id).completions ?? 0) > 0;
    const medal = (id) => ev(id).bestMedal != null;
    const manual = (id) => book.unlockedCourses?.includes(id) ?? false;

    return {
        "summit-line": {
            unlocked: true,
            reason: "",
        },
        "pinecone-pass": {
            unlocked: manual("pinecone-pass") || done("summit-stack"),
            reason: "serve The Summit Stack",
        },
        "glacier-gorge": {
            unlocked: manual("glacier-gorge") ||
                medal("timber-melt") || medal("branch-manager"),
            reason: "medal on Pinecone Pass",
        },
        "midnight-resort": {
            unlocked: manual("midnight-resort") || stars >= 8,
            reason: `earn 8 stars in total (${Math.min(stars, 8)}/8)`,
        },
        "whiteout-ridge": {
            unlocked: manual("whiteout-ridge") ||
                (done("summit-stack") && done("timber-melt") &&
                 done("blue-plate") && done("night-shift")),
            reason: "serve every mountain's main order",
        },
    };
}
