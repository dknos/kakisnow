/**
 * Authoritative telemetry for Big Air Basin's one signature flight.
 *
 * This is deliberately a small simulation-side recorder. It consumes the
 * controller's position and one-frame touchdown latch, never a browser timer
 * or a rendered camera position. As a result classic and rocket-chair runs
 * report the same fields and the result is safe to compare, display, or save
 * later without inventing values at the UI boundary.
 */

export const BIG_AIR_LIP_Z = 300;
export const BIG_AIR_CAPTURE_FROM = 290;
export const BIG_AIR_CAPTURE_TO = 312;
export const BIG_AIR_HOLD_SECONDS = 0.55;

export function isBigAirCourse(course) {
    return course?.id === "big-air-basin";
}

export class BigAirFlightTelemetry {
    constructor({ lipZ = BIG_AIR_LIP_Z } = {}) {
        this.lipZ = lipZ;
        this.reset();
    }

    reset() {
        this.inFlight = false;
        this.result = null;
        this.hold = 0;
        this._x = 0;
        this._y = 0;
        this._z = 0;
        this._lastX = 0;
        this._lastZ = 0;
        this._maxHeight = 0;
        this._maxClearance = 0;
        this._airtime = 0;
        this._vehicle = "classic-snowboard";
    }

    /** Called once per simulation frame before the camera is updated. */
    tick(dt) {
        this.hold = Math.max(0, this.hold - Math.max(0, dt));
    }

    get framingActive() {
        return this.inFlight || this.hold > 0;
    }

    /**
     * Capture only the authored Big Air window. A small amount of lead and
     * tail is intentional: the controller's ballistic solve moves the rider
     * during the same frame it notices the lip.
     */
    shouldBegin(controller) {
        return controller?.airborne === true &&
            controller.position.z >= BIG_AIR_CAPTURE_FROM &&
            controller.position.z <= BIG_AIR_CAPTURE_TO;
    }

    begin(controller, vehicle = "classic-snowboard") {
        if (this.inFlight || !controller) return false;
        this.inFlight = true;
        this.result = null;
        this.hold = 0;
        this._x = controller.position.x;
        this._y = controller.position.y;
        this._z = controller.position.z;
        this._lastX = this._x;
        this._lastZ = this._z;
        this._maxHeight = 0;
        this._maxClearance = Math.max(
            0, controller.position.y - (controller.groundY ?? controller.position.y)
        );
        this._airtime = 0;
        this._vehicle = vehicle || "classic-snowboard";
        return true;
    }

    /** Update only while the controller is airborne. */
    observe(controller, dt) {
        if (!this.inFlight || !controller) return;
        this._airtime += Math.max(0, dt);
        const p = controller.position;
        this._lastX = p.x;
        this._lastZ = p.z;
        this._maxHeight = Math.max(this._maxHeight, p.y - this._y);
        this._maxClearance = Math.max(
            this._maxClearance,
            Math.max(0, p.y - (controller.groundY ?? p.y))
        );
    }

    /**
     * Finalize from the controller's touchdown latch. `landingAirTime` is the
     * physics authority; the accumulated value is only a safe fallback for a
     * synthetic harness that does not expose that latch.
     */
    finish(controller, trick = null) {
        if (!this.inFlight || !controller) return null;
        const p = controller.position;
        const dx = p.x - this._x;
        const dz = p.z - this._z;
        const airtime = Number.isFinite(controller.landingAirTime) &&
            controller.landingAirTime > 0
            ? controller.landingAirTime : this._airtime;
        this.result = {
            vehicle: this._vehicle,
            airtime: round2(airtime),
            distance: round1(Math.hypot(dx, dz)),
            maxHeight: round1(this._maxHeight),
            maxClearance: round1(this._maxClearance),
            trick: trick?.name ?? null,
            trickScore: Number.isFinite(trick?.score) ? trick.score : 0,
            landingGrade: controller.landingGrade ?? "clean",
            recordKey: `big-air-basin:${this._vehicle}`,
        };
        this.inFlight = false;
        this.hold = BIG_AIR_HOLD_SECONDS;
        return this.result;
    }

    snapshot() {
        if (this.inFlight) {
            return {
                vehicle: this._vehicle,
                airtime: round2(this._airtime),
                distance: round1(Math.hypot(this._lastX - this._x, this._lastZ - this._z)),
                maxHeight: round1(this._maxHeight),
                maxClearance: round1(this._maxClearance),
                trick: null,
                trickScore: 0,
                landingGrade: null,
                recordKey: `big-air-basin:${this._vehicle}`,
            };
        }
        return this.result;
    }
}

export function isBetterBigAirFlight(candidate, best) {
    if (!candidate) return false;
    if (!best) return true;
    return candidate.distance > best.distance ||
        (candidate.distance === best.distance &&
            candidate.maxHeight > best.maxHeight);
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
