/**
 * The game's modes, alone in a file.
 *
 * `GameDirector` owns the behaviour and re-exports this, so its callers are
 * unaffected — but the strings themselves are needed by things that must not
 * drag the whole renderer graph behind them: the pause system's pure gating
 * table, and the Node unit tests that pin it. The values are tool ABI
 * (`?mode=free-ride` boots the capture tools) and do not change.
 */
export const Mode = {
    TITLE: "title",
    BURGER_RUN: "burger-run",
    FREE_RIDE: "free-ride",
    ROCKET_TEST: "rocket-test",
};
