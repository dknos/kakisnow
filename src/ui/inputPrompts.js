/** Small input-family-aware labels shared by tutorial/order/reference UI. */
import { bindingLabel } from "../core/playerBindings.js";
import { INPUT_FAMILIES, inputFamilyLabel } from "../core/inputFamily.js";

export function familyLabel(family) { return inputFamilyLabel(family); }

export function promptFor(action, family = INPUT_FAMILIES.KEYBOARD_MOUSE) {
    if (family === INPUT_FAMILIES.TOUCH) return bindingLabel(action, family);
    return bindingLabel(action, family);
}
export function ridePrompts(family = INPUT_FAMILIES.KEYBOARD_MOUSE) {
    const p = (action) => promptFor(action, family);
    if (family === INPUT_FAMILIES.STANDARD_PAD || family === INPUT_FAMILIES.GENERIC_PAD) {
        return {
            steer: "left stick",
            jump: `${p("jump")} / south button`,
            spin: `${p("spinLeft")} / ${p("spinRight")} bumpers`,
            trick: `${p("trickModifier")} / west button`,
            recover: `${p("recover")} / east button`,
            rocket: `${p("rocketBoost")} / right trigger`,
        };
    }
    if (family === INPUT_FAMILIES.TOUCH) {
        return { steer: "touch stick", jump: "JUMP", spin: "touch stick", trick: "TRICK", recover: "touch", rocket: "BOOST" };
    }
    return {
        steer: `${p("steerLeft")} / ${p("steerRight")}`,
        jump: p("jump"),
        spin: `${p("spinLeft")} / ${p("spinRight")}`,
        trick: p("trickModifier"),
        recover: p("recover"),
        rocket: p("rocketBoost"),
    };
}
