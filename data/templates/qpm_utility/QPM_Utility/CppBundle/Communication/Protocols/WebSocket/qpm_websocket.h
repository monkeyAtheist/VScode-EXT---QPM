#ifndef QPM_WEBSOCKET_H
#define QPM_WEBSOCKET_H

#include <stddef.h>
#include <stdint.h>
#include "qpm_socket.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmWebSocketOpcode
{
    QPM_WS_CONTINUATION = 0x0,
    QPM_WS_TEXT = 0x1,
    QPM_WS_BINARY = 0x2,
    QPM_WS_CLOSE = 0x8,
    QPM_WS_PING = 0x9,
    QPM_WS_PONG = 0xA
} QpmWebSocketOpcode;

typedef struct QpmWebSocketFrame
{
    QpmWebSocketOpcode opcode;
    int fin;
    size_t payloadSize;
} QpmWebSocketFrame;

typedef struct QpmWebSocket
{
    QpmSocketHandle socketHandle;
    int connected;
    uint32_t maskState;
} QpmWebSocket;

void QpmWebSocket_Init(QpmWebSocket *ws);
int QpmWebSocket_Connect(QpmWebSocket *ws, const char *url, const char *subprotocol, const char *extraHeaders, int timeoutMs);
void QpmWebSocket_Close(QpmWebSocket *ws, uint16_t statusCode, const char *reason);
int QpmWebSocket_Send(QpmWebSocket *ws, QpmWebSocketOpcode opcode, const void *payload, size_t payloadSize);
int QpmWebSocket_SendText(QpmWebSocket *ws, const char *text);
int QpmWebSocket_SendBinary(QpmWebSocket *ws, const void *data, size_t size);
int QpmWebSocket_Ping(QpmWebSocket *ws, const void *payload, size_t payloadSize);
int QpmWebSocket_Pong(QpmWebSocket *ws, const void *payload, size_t payloadSize);
int QpmWebSocket_Receive(QpmWebSocket *ws, QpmWebSocketFrame *frame, void *payload, size_t payloadCapacity, int timeoutMs);
const char *QpmWebSocket_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
