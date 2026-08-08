/**
 * Return true only for an explicit WebGPU startup/availability failure.
 * Generic device/invariant failures remain unexpected even when the authored
 * unavailable screen is visible.
 */
export function expectedUnavailableError(message) {
    const text = String(message ?? "");
    return [
        /\bwebgpu\b[\s\S]{0,100}\b(?:not available|not supported|unavailable)\b/i,
        /\bwebgpu\b[\s\S]{0,100}\b(?:initiali[sz](?:e|ed|ation)|create|request)\b[\s\S]{0,70}\b(?:failed|failure|error|unsupported|unavailable)\b/i,
        /\bwebgpu\b[\s\S]{0,100}\b(?:adapter|device)\b[\s\S]{0,70}\b(?:failed|failure|error|not found|unavailable|unsupported|cannot|could not)\b/i,
        /\b(?:no suitable|unable to|cannot|could not|failed to)\b[\s\S]{0,70}\b(?:webgpu|gpu)\b[\s\S]{0,70}\b(?:adapter|device)\b/i,
        /\bfatal error\b[\s\S]{0,80}\bwebgpu\b[\s\S]{0,80}\b(?:creation|initiali[sz](?:e|ed|ation))\b/i,
    ].some((pattern) => pattern.test(text));
}
