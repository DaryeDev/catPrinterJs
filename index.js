import {
    findDevice,
    connect,
    disconnect,
    rasterText,
    print
} from "./lib.js";

(async () => {
    const device = await findDevice()
    if (device) {
        connect(device)
        await print(await rasterText("holi"), device)
        disconnect(device)
    } else {
        console.error("Device not found")
    }
})()