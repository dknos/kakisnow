const COURSE_START = 0;
const COURSE_FINISH = 520;

const FEATURES = [
    [82, "FIRST HIT"],
    [214, "BIG TABLE"],
    [292, "NORTH PIPE"],
    [410, "SOUTH PIPE"],
    [472, "FINISH KICKER"],
    [520, "RUNOUT"],
];

/**
 * Quiet trail-map HUD: enough orientation to find the authored terrain without
 * turning the snow study into an arcade dashboard.
 */
export class CourseHud {
    /** @param {import("../character/controller.js").CharacterController} character */
    constructor(character) {
        this.character = character;
        this.el = document.getElementById("course-hud");
        this.featureEl = document.getElementById("course-feature");
        this.distanceEl = document.getElementById("course-distance");
        this.fillEl = document.getElementById("course-fill");
        this._acc = 1;
    }

    update(dt) {
        if (!this.el) return;
        this._acc += dt;
        if (this._acc < 0.08) return;
        this._acc = 0;

        const ch = this.character;
        const z = ch.position.z;
        const progress = clamp01((z - COURSE_START) / (COURSE_FINISH - COURSE_START));
        this.fillEl.style.transform = `scaleX(${progress.toFixed(3)})`;

        if (!ch.grounded) {
            const clearance = Math.max(0, ch.position.y - ch.groundY);
            this.featureEl.textContent = `AIR · ${clearance.toFixed(1)} M`;
        } else if (z >= COURSE_FINISH) {
            this.featureEl.textContent = "RUN COMPLETE";
        } else if (z >= 292 && z < 394) {
            this.featureEl.textContent = "NORTH PIPE";
        } else if (z >= 410 && z < 470) {
            this.featureEl.textContent = "SOUTH PIPE";
        } else {
            let next = FEATURES[0];
            for (let i = 0; i < FEATURES.length; i++) {
                if (FEATURES[i][0] >= z) {
                    next = FEATURES[i];
                    break;
                }
            }
            this.featureEl.textContent = next[1];
        }

        const metres = Math.max(0, Math.min(COURSE_FINISH, Math.round(z)));
        this.distanceEl.textContent = `${metres} / ${COURSE_FINISH} M`;
    }
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
