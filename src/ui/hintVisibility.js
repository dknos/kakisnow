/**
 * The legacy control hint belongs to the unscored playgrounds only.
 *
 * Keep this decision pure so the loading handoff, UI screens, and the game
 * director cannot drift into a CSS-timing convention. A visible menu always
 * wins over the lab mode: order cards, results, pause, and settings need the
 * whole screen for their own instructions.
 */

import { Mode } from "../game/modes.js";

/**
 * @param {string} mode one of the public game modes
 * @param {boolean} screenVisible whether a UI/menu screen is currently shown
 * @returns {boolean}
 */
export function shouldShowHint(mode, screenVisible) {
    return !screenVisible && (mode === Mode.FREE_RIDE || mode === Mode.ROCKET_TEST);
}
