import { WebSocketServer } from 'ws';
import { findDevice, connect, isConnected, rasterText, print } from "./lib.js";
import sharp from 'sharp';
import axios from 'axios';

let device = null;
let printerConnected = false;
const clients = new Set();

async function managePrinterConnection() {
    if (device && isConnected(device)) {
        printerConnected = true;
        return;
    }

    printerConnected = false;
    console.log("Printer disconnected. Attempting to find and connect...");
    notifyClients({ type: 'status', message: 'Printer disconnected. Trying to reconnect...' });

    try {
        device = await findDevice();
        if (device) {
            console.log("Printer found. Connecting...");
            connect(device);
            printerConnected = isConnected(device);
            if (printerConnected) {
                console.log("Printer connected.");
                notifyClients({ type: 'status', message: 'Printer connected.' });
            } else {
                console.log("Failed to connect to the printer.");
                device = null; 
            }
        } else {
            console.log("No printer found.");
        }
    } catch (error) {
        console.error("Error during printer connection management:", error);
        device = null;
        printerConnected = false;
    }
}

setInterval(managePrinterConnection, 5000);
managePrinterConnection();

const wss = new WebSocketServer({ port: 8080 });

function notifyClients(message) {
    const serializedMessage = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(serializedMessage);
        }
    });
}

wss.on('connection', ws => {
    clients.add(ws);
    console.log('Client connected');

    ws.send(JSON.stringify({
        type: 'status',
        message: printerConnected ? 'Printer connected.' : 'Printer not connected.'
    }));

    ws.on('message', async message => {
        if (!printerConnected || !device) {
            ws.send(JSON.stringify({ type: 'error', message: 'Printer not available.' }));
            return;
        }

        let request;
        try {
            request = JSON.parse(message);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON.' }));
            return;
        }

        console.log('Received:', request);

        try {
            let imageToPrint;
            if (request.type === 'text') {
                imageToPrint = await rasterText(request.data);
            } else if (request.type === 'image') {
                const imageData = request.data;
                let imageBuffer;

                if (imageData.startsWith('http')) {
                    const response = await axios.get(imageData, { responseType: 'arraybuffer' });
                    imageBuffer = Buffer.from(response.data, 'binary');
                } else if (imageData.startsWith('data:image')) {
                    const base64Data = imageData.split(';base64,').pop();
                    imageBuffer = Buffer.from(base64Data, 'base64');
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid image format.' }));
                    return;
                }
                imageToPrint = sharp(imageBuffer);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid request type.' }));
                return;
            }

            if (imageToPrint) {
                ws.send(JSON.stringify({ type: 'info', message: 'Printing...' }));
                await print(imageToPrint, device);
                ws.send(JSON.stringify({ type: 'info', message: 'Print job complete.' }));
            }
        } catch (error) {
            console.error("Printing error:", error);
            ws.send(JSON.stringify({ type: 'error', message: `Printing failed: ${error.message}` }));
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});

console.log('WebSocket server started on port 8080');