/**
 * The authored half of Recipe Tapes. The physical tape ids stay in the course
 * registry; this table only gives a found tape something worth opening in the
 * Burger Book. Keys are course id + tape id so a tape-1 can never show the
 * wrong mountain's note.
 */
export const RECIPE_TAPE_CONTENT = Object.freeze({
    "summit-line:tape-1": "The summit wind has a personal grudge against cheese. It is winning.",
    "summit-line:tape-2": "Field note: the north pipe echoes in a key nobody ordered.",
    "summit-line:tape-3": "Base Camp says the last turn is not a shortcut. Base Camp is lying politely.",
    "pinecone-pass:tape-1": "A pinecone is just a tiny mountain with excellent marketing.",
    "pinecone-pass:tape-2": "The creek keeps receipts. Miss the line and it remembers your boots.",
    "pinecone-pass:tape-3": "Ranger report: one squirrel requested a chairlift. Request denied.",
    "glacier-gorge:tape-1": "Ice does not heckle. It simply waits for your edge to make a speech.",
    "glacier-gorge:tape-2": "Research log: blue hour begins when the burger looks medically interesting.",
    "glacier-gorge:tape-3": "The serac field is quiet today. Please keep it that way, snow person.",
    "midnight-resort:tape-1": "The floodlights run on old applause and one extremely long extension cord.",
    "midnight-resort:tape-2": "Park rule seven: land clean. Park rule eight: pretend the wobble was style.",
    "midnight-resort:tape-3": "Last lift, last fry, last chance to make the night shift proud.",
    "whiteout-ridge:tape-1": "Storm marker says east. The storm marker has never snowboarded east.",
    "whiteout-ridge:tape-2": "Avalanche crew motto: clear the ridge, save the onion, warm the hands.",
    "whiteout-ridge:tape-3": "If you can see the beacon, you can serve the order. If not, keep carving.",
    "big-air-basin:tape-1": "Judge one says height. Judge two says distance. Judge three brought a sandwich.",
    "big-air-basin:tape-2": "The lift goes up so the run can go down. This is considered a system.",
    "big-air-basin:tape-3": "A good landing is a conversation between gravity and your knees.",
});

export const RECIPE_TAPE_TITLES = Object.freeze({
    "summit-line:tape-1": "Wind Report: Cheese",
    "summit-line:tape-2": "North Pipe Echo",
    "summit-line:tape-3": "The Honest Shortcut",
    "pinecone-pass:tape-1": "Small Mountain Theory",
    "pinecone-pass:tape-2": "Creek Receipts",
    "pinecone-pass:tape-3": "Ranger Desk Memo",
    "glacier-gorge:tape-1": "Edge Etiquette",
    "glacier-gorge:tape-2": "Blue Hour Log",
    "glacier-gorge:tape-3": "Serac Silence",
    "midnight-resort:tape-1": "Floodlight Budget",
    "midnight-resort:tape-2": "Park Rules Seven & Eight",
    "midnight-resort:tape-3": "Last Lift Radio",
    "whiteout-ridge:tape-1": "Storm Marker Argument",
    "whiteout-ridge:tape-2": "Avalanche Crew Motto",
    "whiteout-ridge:tape-3": "Beacon Line",
    "big-air-basin:tape-1": "Three Judges, One Sandwich",
    "big-air-basin:tape-2": "Lift Logic",
    "big-air-basin:tape-3": "Gravity Conversation",
});

export function recipeTapeTitle(courseId, tapeId) {
    return RECIPE_TAPE_TITLES[`${courseId}:${tapeId}`] ?? "Mountain Field Note";
}

export function recipeTapeContent(courseId, tapeId) {
    return RECIPE_TAPE_CONTENT[`${courseId}:${tapeId}`] ??
        "The tape is warm, the trail is cold, and somebody left a burger here.";
}
