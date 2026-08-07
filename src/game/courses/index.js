/**
 * The course registry, and the one slot that says which course is live.
 *
 * Everything that used to import Summit constants imports the active course
 * instead. The registry validates every definition at module load — a course
 * that fails validation should take the build down in development, loudly and
 * with the reason, rather than ship a zone that quietly sits in a landing.
 *
 * This module must stay importable by bare Node and by the in-page module
 * loads the placement validator does: data and pure functions only, no
 * renderer imports, no DOM.
 */

import { SUMMIT_LINE } from "./summitLine.js";
import { PINECONE_PASS } from "./pineconePass.js";
import { GLACIER_GORGE } from "./glacierGorge.js";
import { validateCourse } from "./validate.js";

/** @type {Record<string, object>} every playable course, keyed by id. */
export const COURSES = {
    [SUMMIT_LINE.id]: SUMMIT_LINE,
    [PINECONE_PASS.id]: PINECONE_PASS,
    [GLACIER_GORGE.id]: GLACIER_GORGE,
};

export const DEFAULT_COURSE_ID = SUMMIT_LINE.id;

for (const course of Object.values(COURSES)) {
    const problems = validateCourse(course);
    if (problems.length) {
        throw new Error(
            `course "${course.id}" failed validation:\n - ` + problems.join("\n - ")
        );
    }
}

/** @param {string} id @returns {object} throws on an unknown id. */
export function getCourse(id) {
    const c = COURSES[id];
    if (!c) throw new Error(`unknown course "${id}"`);
    return c;
}

/**
 * The live course. One mutable slot, set once at boot (from `?course=` or the
 * default) and later by the course loader. Everything per-frame reads through
 * `activeCourse()` so a switch is one assignment plus the terrain lifecycle,
 * not a hunt for stale references.
 */
let _active = SUMMIT_LINE;

export function activeCourse() {
    return _active;
}

export function setActiveCourse(id) {
    _active = getCourse(id);
    return _active;
}
