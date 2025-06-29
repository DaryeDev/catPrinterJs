import { bindings } from "simpleble";
import sharp from 'sharp';
import { createCanvas } from 'canvas';

const crc8_table = [
    0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15, 0x38, 0x3f, 0x36, 0x31,
    0x24, 0x23, 0x2a, 0x2d, 0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65,
    0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d, 0xe0, 0xe7, 0xee, 0xe9,
    0xfc, 0xfb, 0xf2, 0xf5, 0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd,
    0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8, 0xaf, 0xa6, 0xa1,
    0xb4, 0xb3, 0xba, 0xbd, 0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2,
    0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4, 0xed, 0xea, 0xb7, 0xb0, 0xb9, 0xbe,
    0xab, 0xac, 0xa5, 0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d, 0x9a,
    0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f, 0x18, 0x11, 0x16,
    0x03, 0x04, 0x0d, 0x0a, 0x57, 0x50, 0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42,
    0x6f, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7d, 0x7a, 0x89, 0x8e, 0x87, 0x80,
    0x95, 0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4,
    0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec, 0xc1, 0xc6, 0xcf, 0xc8,
    0xdd, 0xda, 0xd3, 0xd4, 0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c,
    0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44, 0x19, 0x1e, 0x17, 0x10,
    0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a, 0x33, 0x34,
    0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f,
    0x6a, 0x6d, 0x64, 0x63, 0x3e, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b,
    0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d, 0x14, 0x13, 0xae, 0xa9, 0xa0, 0xa7,
    0xb2, 0xb5, 0xbc, 0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83,
    0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb, 0xe6, 0xe1, 0xe8, 0xef,
    0xfa, 0xfd, 0xf4, 0xf3
];

const compatibleDevices = [
    "MX06",
]

// Commands
const cmds = {
    RetractPaper: 0xA0,      // Data: Number of steps to go back
    FeedPaper: 0xA1,         // Data: Number of steps to go forward
    DrawBitmap: 0xA2,        // Data: Line to draw. 0 bit -> don't draw pixel, 1 bit -> draw pixel
    GetDevState: 0xA3,       // Data: 0
    ControlLattice: 0xA6,    // Data: Eleven bytes, all constants. One set used before printing, one after.
    GetDevInfo: 0xA8,        // Data: 0
    OtherFeedPaper: 0xBD,    // Data: one byte, set to a device-specific "Speed" value before printing
                             // and to 0x19 before feeding blank paper
    DrawingMode: 0xBE,       // Data: 1 for Text, 0 for Images
    SetEnergy: 0xAF,         // Data: 1 - 0xFFFF
    SetQuality: 0xA4         // Data: 0x31 - 0x35. APK always sets 0x33 for GB01
};

const PrintLattice = [0xAA, 0x55, 0x17, 0x38, 0x44, 0x5F, 0x5F, 0x5F, 0x44, 0x38, 0x2C]
const FinishLattice = [0xAA, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17]
const XOff = (0x51, 0x78, 0xAE, 0x01, 0x01, 0x00, 0x10, 0x70, 0xFF)
const XOn = (0x51, 0x78, 0xAE, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF)

const energy = {
    0: printer_short(8000),
    1: printer_short(12000),
    2: printer_short(17500),
}
const contrast = 2

const PrinterWidth = 384

const ImgPrintSpeed = [0x23]
const BlankSpeed = [0x19]

let feedLines = 60
let headerLines = 0
let scaleFeed = false

const packetLength = 60
let throttle = 0.01

const PrinterNotifyService = "0000ae30-0000-1000-8000-00805f9b34fb"
const PrinterCharacteristic = "0000ae01-0000-1000-8000-00805f9b34fb"
const NotifyCharacteristic = "0000ae02-0000-1000-8000-00805f9b34fb"

// show notification data
const debug = false

function formatMessage(command, data) {
    function crc8(d) { // Renombrado para evitar conflicto
        let crc = 0;
        for (let i = 0; i < d.length; i++) {
            crc = crc8_table[(crc ^ d[i]) & 0xFF];
        }
        return crc & 0xFF;
    }

    // El mensaje se construye con todos los componentes, incluyendo el CRC de los datos.
    return [
        0x51, 0x78,      // Cabecera
        command,         // Comando
        0x00,            // Reservado
        data.length,     // Longitud de los datos
        0x00,            // Reservado
        ...data,         // Datos
        crc8(data),      // CRC calculado SOLO sobre los datos
        0xFF             // Byte final
    ];
}

function requestStatus() {
    return formatMessage(cmds.GetDevState, [0x00])
}

function printer_short(value) {
    return [value & 0xFF, (value >> 8) & 0xFF]
}

function blankPaper(lines) {
    // Feed extra paper for image to be visible
    let blank_commands = formatMessage(cmds.OtherFeedPaper, BlankSpeed);
    let count = lines;
    while (count > 0) {
        const feed = Math.min(count, 0xFF);
        // Usa el spread operator para añadir los elementos del nuevo array
        blank_commands.push(...formatMessage(cmds.FeedPaper, printer_short(feed)));
        count -= feed;
    }
    return blank_commands;

}

function RetractPaper(lines) {
    let blank_commands = [];
    let count = lines;
    while (count > 0) {
        const feed = Math.min(count, 0xFF);
        blank_commands.push(...formatMessage(cmds.RetractPaper, printer_short(feed)));
        count -= feed;
    }
    return blank_commands;
}

function notificationHandler(data) {
    const sender = "nose"
    if (debug) {
        console.log(`${sender}: [ ${Array.from(data).map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ')} ]`);
    }
    if (Array.isArray(data) && data.length > 0 && Array.from(data).toString() === XOff.toString()) {
        console.error("ERROR: printer data overrun!");
        return;
    }
    if (data[2] === cmds.GetDevState) {
        if ((data[6] & 0b1000) !== 0) {
            console.warn("warning: low battery! print quality might be affected…");
        }
        // printer status byte: data[6]
        // xxxxxxx1 no_paper ("No paper.")
        // xxxxxx10 paper_positions_open ("Warehouse.")
        // xxxxx100 too_hot ("Too hot, please let me take a break.")
        // xxxx1000 no_power_please_charge ("I have no electricity, please charge")
        // I don't know if multiple status bits can be on at once, but if they are, then iPrint won't detect them.
        // In any case, I think the low battery flag is the only one the GB01 uses.
        // It also turns out this flag might not turn on, even when the battery's so low the printer shuts itself off…
        return;
    }
}


async function renderImage(img) {
    const cmdQueue = []

    // Set quality to standard
    cmdQueue.push(...formatMessage(cmds.SetQuality, [0x33]))
    // start and/or set up the lattice, whatever that is
    cmdQueue.push(...formatMessage(cmds.ControlLattice, PrintLattice))
    // Set energy used
    cmdQueue.push(...formatMessage(cmds.SetEnergy, energy[contrast]))
    // Set mode to image mode
    cmdQueue.push(...formatMessage(cmds.DrawingMode, [0]))
    // not entirely sure what this does
    cmdQueue.push(...formatMessage(cmds.OtherFeedPaper, ImgPrintSpeed))

    const imgMetadata = await img.metadata()
    const imgWidth = imgMetadata.width
    const imgHeight = imgMetadata.height

    if (imgWidth > PrinterWidth) {
        // Scale the image to the printer width
        const scaleFactor = PrinterWidth / imgWidth
        img = img.resize(PrinterWidth, Math.round(imgHeight * scaleFactor))
    }

    if (img.width < Math.floor(PrinterWidth / 2)) {
        // Scale up to largest whole multiple
        const scaleFactor = Math.floor(PrinterWidth / img.width)
        if (scaleFeed) {
            headerLines = Math.floor(headerLines * scaleFactor)
            feedLines = Math.floor(feedLines * scaleFactor)
        }
        img = img.resize(Math.floor(imgWidth * scaleFactor), Math.floor(imgHeight * scaleFactor), {
            kernel: 'nearest'
        });
    }

    function floydSteinbergDither(imageData, width, height) {
        // Hacemos una copia para no modificar el buffer original directamente
        const pixelData = new Uint8ClampedArray(imageData);
    
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const oldPixel = pixelData[index];
                // 1. Convertir al color más cercano (0 o 255)
                const newPixel = oldPixel < 128 ? 0 : 255;
                pixelData[index] = newPixel;
    
                // 2. Calcular el error
                const quantError = oldPixel - newPixel;
    
                // 3. Distribuir el error a los vecinos
                // Vecino a la derecha
                if (x + 1 < width) {
                    pixelData[index + 1] += quantError * 7 / 16;
                }
                // Vecino abajo-izquierda
                if (x - 1 >= 0 && y + 1 < height) {
                    pixelData[index - 1 + width] += quantError * 3 / 16;
                }
                // Vecino abajo
                if (y + 1 < height) {
                    pixelData[index + width] += quantError * 5 / 16;
                }
                // Vecino abajo-derecha
                if (x + 1 < width && y + 1 < height) {
                    pixelData[index + 1 + width] += quantError * 1 / 16;
                }
            }
        }
        return pixelData;
    }

    img = img.rotate(180).toColourspace('b-w');

    // Obtener las dimensiones FINALES antes de rellenar
    let finalMetadata = await img.metadata();

    if (finalMetadata.width < PrinterWidth) {
        const padAmount = Math.floor((PrinterWidth - finalMetadata.width) / 2);
        const rightPadAmount = PrinterWidth - finalMetadata.width - padAmount; // Para anchos impares
        img = img.extend({
            top: 0,
            bottom: 0,
            left: padAmount,
            right: rightPadAmount,
            background: { r: 255, g: 255, b: 255, alpha: 1 } // Fondo blanco opaco
        });
    }

    if (headerLines > 0) {
        cmdQueue.push(...formatMessage(cmds.OtherFeedPaper, printer_short(headerLines)));
    }

    let { data, info } = await img
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    
    const { width, height } = info;
    data = floydSteinbergDither(data, width, height);

    for (let y = 0; y < height; y++) {
        let bmp = [];
        let bit = 0;

        for (let x = 0; x < width; x++) {
            if (bit % 8 == 0) bmp.push(0x00);
            const byteIndex = Math.floor(bit / 8);

            bmp[byteIndex] >>= 1; // Desplaza a la derecha
            const pixelIndex = y * width + x;
            if (data[pixelIndex] === 0) { // Negro
                bmp[byteIndex] |= 0x80; // Pone el bit más significativo
            }
            bit++;
        }


        cmdQueue.push(...formatMessage(cmds.DrawBitmap, bmp));
    }

    cmdQueue.push(...formatMessage(cmds.ControlLattice, FinishLattice));
    return cmdQueue;

}

export async function rasterText(text, fontFamily = 'monospace', fontSize = 40, lineHeight = 40, textColor = '#000', backgroundColor = '#fff') {
    function wrapText(context, text, maxWidth) {
        const lines = [];
        let currentLine = '';

        // Primero, dividimos el texto en palabras.
        const words = text.split(' ');

        for (const word of words) {
            // CASO 1: La palabra por sí sola es más ancha que el máximo.
            if (context.measureText(word).width > maxWidth) {
                // Si hay algo en la línea actual, lo guardamos primero.
                if (currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = '';
                }

                // Ahora dividimos la palabra larga carácter por carácter.
                let tempWord = '';
                for (const char of word) {
                    const testWord = tempWord + char;
                    if (context.measureText(testWord).width > maxWidth) {
                        lines.push(tempWord); // Guardamos la parte que sí cabía.
                        tempWord = char;      // Empezamos una nueva parte con el carácter actual.
                    } else {
                        tempWord = testWord;  // El carácter cabe, lo añadimos.
                    }
                }
                // La parte sobrante de la palabra rota se convierte en la línea actual.
                currentLine = tempWord;

            } else {
                // CASO 2: La palabra cabe, pero ¿cabe en la línea actual?
                const testLine = currentLine === '' ? word : `${currentLine} ${word}`;
                if (context.measureText(testLine).width > maxWidth) {
                    // No cabe. Guardamos la línea actual y empezamos una nueva con la palabra.
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    // Sí cabe. La añadimos a la línea actual.
                    currentLine = testLine;
                }
            }
        }

        // No olvidar guardar la última línea que se estaba construyendo.
        if (currentLine !== '') {
            lines.push(currentLine);
        }

        return lines;
    }

    const maxWidth = PrinterWidth
    const canvas = createCanvas(maxWidth, 1)
    const context = canvas.getContext('2d')
    context.font = `${fontSize}px ${fontFamily}`

    const lines = wrapText(context, text, maxWidth)

    // Ajustamos la altura de la imagen final dinámicamente
    // Añadimos un pequeño padding vertical
    const paddingY = 6;
    const totalHeight = (lines.length * lineHeight) + (paddingY * 2);

    // El punto Y inicial para el texto
    const initialY = paddingY + fontSize;

    const svgTextElements = lines.map((line, index) =>
        `<tspan x="5" dy="${index === 0 ? 0 : lineHeight}">${line}</tspan>`
    ).join('');

    const svg = `
        <svg width="${maxWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="${backgroundColor}"/>
            <text x="5" y="${initialY}" font-family="${fontFamily}" font-size="${fontSize}px" fill="${textColor}">
                ${svgTextElements}
            </text>
        </svg>
    `;

    const svgBuffer = Buffer.from(svg);

    return sharp(svgBuffer).png()
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function findDevice(searchDelay = 5000) {
    const adaptersCount = bindings.simpleble_adapter_get_count();
    if (adaptersCount === 0) {
        console.error("No Bluetooth adapters found");
        return;
    }

    const adapter = bindings.simpleble_adapter_get_handle(0);

    bindings.simpleble_adapter_scan_start(adapter);
    await delay(searchDelay);
    bindings.simpleble_adapter_scan_stop(adapter);

    const resultsCount = bindings.simpleble_adapter_scan_get_results_count(adapter);
    if (resultsCount === 0) {
        console.error("No devices found");
        return;
    }

    for (let i = 0; i < resultsCount; i++) {
        const d = bindings.simpleble_adapter_scan_get_results_handle(adapter, i);
        const id = bindings.simpleble_peripheral_identifier(d);
        const address = bindings.simpleble_peripheral_address(d);
        if (compatibleDevices.includes(id)) {
            console.log(`Found device: ${id} [${address}]`);
            return d;
        }
    }
    console.error("Device not found");
    return;
}

export async function print(imgQueue, device, blankLinesAfterPrint = 40) {
    if (!device) {
        device = await findDevice()
    }
    if (!isConnected(device)) {
        connect(device)
    }
    if (!device || !isConnected(device)) {
        console.error("Device not found");
        return;
    }

    // bindings.simpleble_peripheral_notify(device, PrinterNotifyService, NotifyCharacteristic, notificationHandler);

    let cmdQueue = []
    if (Array.isArray(imgQueue)) {
        imgQueue.reverse();
        for (const img of imgQueue) {
            cmdQueue.push(...await renderImage(img))
        }
    } else if (imgQueue instanceof sharp) {
        cmdQueue.push(...await renderImage(imgQueue))
    } else {
        console.error("Invalid image queue");
        return;
    }

    cmdQueue = [...requestStatus(), ...cmdQueue, ...(blankLinesAfterPrint ? blankPaper(blankLinesAfterPrint) : [])]

    let offset = 0
    const uint8Array = new Uint8Array(cmdQueue.flat())

    console.log("Sending data");
    while (offset < uint8Array.length) {
        const packet = uint8Array.slice(offset, offset + packetLength);
        bindings.simpleble_peripheral_write_command(
            device,
            PrinterNotifyService,
            PrinterCharacteristic,
            packet
        );
        offset += packetLength;
        if (throttle !== null) {
            await delay(throttle);
        }
    }
    console.log("Data sent");
}

export function connect(device) {
    const connected = bindings.simpleble_peripheral_connect(device);
    if (!connected) {
        console.error("Failed to connect");
        return;
    }
    console.log("Connected");
}

export function disconnect(device) {
    bindings.simpleble_peripheral_disconnect(device);
    console.log("Disconnected");
}

export function isConnected(device) {
    return bindings.simpleble_peripheral_is_connected(device);
}

// async function printText(text) {
//     const device = await findDevice()
//     connect(device)
//     if (!device || !isConnected(device)) {
//         console.error("Device not found");
//         return;
//     }

//     const imgQueue = []

//     imgQueue.push(await rasterText(text))
//     // imgQueue.push(await rasterText("audiojungle"))

//     // await delay(5000)
//     await print(imgQueue, device, 40)

//     // await delay(30000)
//     // await print(new sharp("yo.png"), device, 40)

//     disconnect(device)
// }

// printText("holi")