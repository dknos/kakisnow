/** Return the supported render visibility for the optional race ghost. */
export function ghostVisibility(settings = {}) {
    if (settings.showGhost === false) return 0;
    const opacity = Number(settings.ghostOpacity);
    return Number.isFinite(opacity)
        ? Math.max(0.25, Math.min(1, opacity))
        : 0.72;
}
