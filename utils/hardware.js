import { Config } from "../constants.js";

export async function getUserHardwareSpecs() {
    if (!navigator.gpu) {
        return { sufficientHardware: false, vramGB: 0 };
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        return { sufficientHardware: false, vramGB: 0 };
    }

    const maxBufferSize = adapter.limits?.maxBufferSize;
    if (typeof maxBufferSize !== "number") {
        return { sufficientHardware: false, vramGB: 0 };
    }

    const vramGB = maxBufferSize / (1024 ** 3);
    const sufficientHardware = vramGB >= Config.MIN_VRAM_GB;

    return { sufficientHardware, vramGB };
}