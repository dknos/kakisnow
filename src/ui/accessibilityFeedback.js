/**
 * Compact, non-colour state language for the run HUD. The renderer can use
 * the same strings for visible captions and aria-live announcements, so muted
 * play never loses a meaningful warning.
 */
export const FEEDBACK_ICONS = Object.freeze({
    snowcat: "[CAT]", avalanche: "[AVALANCHE]", fuel: "[FUEL]",
    crash: "[CRASH]", landing: "[LAND]", ingredient: "[ORDER]", finish: "[GRILL]",
});

export function accessibilityCuesEnabled(settings = {}) {
    return Boolean(settings.routeAssist || settings.ingredientBeacon || settings.highContrast);
}

export function feedbackText(kind, value = {}) {
    const icon = FEEDBACK_ICONS[kind] ?? "[INFO]";
    switch (kind) {
        case "snowcat": return `${icon} SNOWCAT NEAR · ${Math.round(value.distance ?? 0)} M`;
        case "avalanche": return `${icon} AVALANCHE CLOSE · ${Math.max(0, Math.round(value.distance ?? 0))} M`;
        case "fuel": return value.text
            ? `${icon} ${String(value.text).toUpperCase()}`
            : `${icon} LOW FUEL · ${Math.round((value.level ?? 0) * 100)}%`;
        case "crash": return `${icon} CRASH · RECOVER`;
        case "landing": return `${icon} LANDING · ${(value.grade ?? "clean").toUpperCase()}`;
        case "ingredient": return `${icon} COLLECTED · ${String(value.label ?? "INGREDIENT").toUpperCase()}`;
        case "finish": return `${icon} GRILL AHEAD · SERVE ORDER`;
        default: return `${icon} ${String(value.text ?? "")}`.trim();
    }
}

/** Per-kind cooldown gate to prevent audio-equivalent caption spam. */
export class FeedbackCooldown {
    constructor(cooldownMs = 850) {
        this.cooldownMs = cooldownMs;
        this.last = new Map();
    }
    allow(kind, now = Date.now()) {
        const before = this.last.get(kind) ?? -Infinity;
        if (now - before < this.cooldownMs) return false;
        this.last.set(kind, now);
        return true;
    }
    reset() { this.last.clear(); }
}
