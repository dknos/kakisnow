/**
 * Quiet trail-map HUD: enough orientation to find the authored terrain without
 * turning the snow study into an arcade dashboard.
 *
 * Everything it names comes from the active course definition — the third
 * hand-copied set of Summit numbers used to live here, and its pipe windows
 * had already drifted from the scoring's. Now the definition is the only
 * copy: `features` are the landmarks it counts down to, `insideSpans` are
 * where it keeps naming the feature the rider is in.
 */
export class CourseHud {
    /**
     * @param {import("../character/controller.js").CharacterController} character
     * @param {object} course the active course definition
     */
    constructor(character, course) {
        this.character = character;
        this.course = course;
        this.el = document.getElementById("course-hud");
        this.featureEl = document.getElementById("course-feature");
        this.distanceEl = document.getElementById("course-distance");
        this.fillEl = document.getElementById("course-fill");
        this.nameEl = document.getElementById("course-name");
        this._acc = 1;
        this._applyCourse();
    }

    /** Point the HUD at a different course. The loader calls this on switch. */
    setCourse(course) {
        this.course = course;
        this._applyCourse();
    }

    _applyCourse() {
        if (this.nameEl) {
            this.nameEl.textContent =
                `${this.course.title} · ${this.course.difficulty}`;
        }
        // The static markup ships with the Summit numbers; correct it the
        // moment a course is known so it can never lie about another one.
        if (this.distanceEl) {
            this.distanceEl.textContent = `0 / ${this.course.runLength} M`;
        }
    }

    update(dt) {
        if (!this.el) return;
        this._acc += dt;
        if (this._acc < 0.08) return;
        this._acc = 0;

        const c = this.course;
        const ch = this.character;
        const z = ch.position.z;
        const progress = clamp01((z - c.startZ) / (c.finishZ - c.startZ));
        this.fillEl.style.transform = `scaleX(${progress.toFixed(3)})`;

        if (!ch.grounded) {
            const clearance = Math.max(0, ch.position.y - ch.groundY);
            this.featureEl.textContent = `AIR · ${clearance.toFixed(1)} M`;
        } else if (z >= c.finishZ) {
            this.featureEl.textContent = "RUN COMPLETE";
        } else {
            const inside = (c.insideSpans ?? []).find(
                (s) => z >= s.from && z < s.to
            );
            if (inside) {
                this.featureEl.textContent = inside.label;
            } else {
                let next = c.features[0];
                for (let i = 0; i < c.features.length; i++) {
                    if (c.features[i].z >= z) {
                        next = c.features[i];
                        break;
                    }
                }
                this.featureEl.textContent = next.label;
            }
        }

        const span = c.finishZ - c.startZ;
        const metres = Math.max(0, Math.min(span, Math.round(z - c.startZ)));
        this.distanceEl.textContent = `${metres} / ${span} M`;
    }
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
