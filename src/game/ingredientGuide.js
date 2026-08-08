/**
 * Return whether the tall optional route marker should remain visible for an
 * ingredient. The groomed pad deliberately survives collection, but a raised
 * guide after collection would read as a route instruction to turn around.
 */
export function shouldShowIngredientGuide(item, cuesEnabled) {
    return !!cuesEnabled && !item?.collected;
}
