/**
 * Resolve the boot intent carried by the URL.
 *
 * An event query is an authored start request, even when a caller omitted the
 * mode parameter. Keeping this rule pure makes the cross-course Burger Book
 * hand-off testable without booting the renderer, while the registry/course
 * match prevents a stale or malformed query from starting the wrong order.
 */
export function bootIntent({
    requestedMode = null,
    eventParam = null,
    eventRegistry = {},
    courseId = null,
} = {}) {
    if (requestedMode === "free-ride" || requestedMode === "burger-run") {
        return requestedMode;
    }
    const event = eventParam && eventRegistry?.[eventParam];
    return event?.courseId === courseId ? "burger-run" : "title";
}
