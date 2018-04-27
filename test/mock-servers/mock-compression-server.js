const net = require('net');
const tls = require('tls');
const fs = require('fs');
const pkt = require('./packet.js');
const message = require('./message.js');

const HOST = '127.0.0.1';
const TCP_PORT = 4100;
const TLS_PORT = TCP_PORT+1;
const HEARTBEAT_INTERVAL = 6;

let heartbeatInterval;
let clientDisconnected = false;

function readMessageType(buf) {
    let flag = buf[0];
    let type = (flag >> 1) & 0x7;

    console.log();
    console.log('readMessageType flag ', flag);
    console.log('readMessageType ', type);
    console.log();
}

function processPacket(packet, clientSocket) {
    console.log('processing packet');

    switch (packet.type) {
    case pkt.PacketType.Handshake:
        pkt.sendHandshakeResponse(clientSocket);
        break;

    case pkt.PacketType.HandshakeAck:
        break;

    case pkt.PacketType.Data:
        const [msg, decodeError] = message.decode(packet.data);
        if (decodeError) {
            throw decodeError;
        }
        console.log(msg);

        const respData = {
            isCompressed: msg.gzipped,
        };

        console.log(respData);

        const respMsg = message.createResponseMessage(msg.id, JSON.stringify(respData));
        const [encodedRespMsg, encodeError] = message.encode(respMsg);
        if (encodeError) {
            throw encodeError;
        }

        const respPacket = pkt.encode(pkt.PacketType.Data, encodedRespMsg);
        clientSocket.write(respPacket);
        break;

    case pkt.PacketType.Heartbeat:
        if (!heartbeatInterval) {
            heartbeatInterval = setInterval(() => {
                if (clientSocket && !clientSocket.destroyed) {
                    pkt.sendHeartbeat(clientSocket);
                }
            }, 2000);
        }
        break;
    }
}

function processBuffer(buffer, socket) {
    console.log(`Received ${buffer.length} bytes of data`);
    const rawPackets = new pkt.RawPackets(buffer);
    const packets = rawPackets.decode();

    console.log(`Decoded ${packets.length} packet(s)`);

    for (let p of packets) {
        processPacket(p, socket);
    }
}

const tcpServer = net.createServer((socket) => {
    console.log('======= New TCP Connection ========');

    socket.on('data', (buffer) => {
        console.log(`type `, buffer[0]);
        processBuffer(buffer, socket);
    });

    socket.on('end', () => {
        clientDisconnected = true;
        console.log('Client disconnected :(');
    });
});


const tlsOptions = {
    key: fs.readFileSync('../server/fixtures/server/client-ssl.localhost.key'),
    cert: fs.readFileSync('../server/fixtures/server/client-ssl.localhost.crt'),
    rejectUnauthorized: false,
};

const tlsServer = tls.createServer(tlsOptions, (socket) => {
    console.log('======= New TLS Connection ========');
    console.log(socket.authorized ? 'Authorized' : 'Unauthorized');

    socket.on('data', (buffer) => {
        console.log(`type `, buffer[0]);
        processBuffer(buffer, socket);
    });

    socket.on('end', () => {
        clientDisconnected = true;
        console.log('Client disconnected :(');
    });
});

tcpServer.listen(TCP_PORT, HOST, () => {
    console.log(`TCP server on ${HOST}:${TCP_PORT}`);
});

tlsServer.listen(TLS_PORT, HOST, () => {
    console.log(`TLS server on ${HOST}:${TLS_PORT}`);
});

pkt.encodeHanshakeAndHeartbeatResponse(HEARTBEAT_INTERVAL);
