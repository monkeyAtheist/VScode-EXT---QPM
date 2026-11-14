#include "qpm_websocket.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define QPM_WS_HANDSHAKE_MAX 16384

typedef struct QpmSha1
{
    uint32_t h[5];
    uint64_t length;
    uint8_t block[64];
    size_t used;
} QpmSha1;

static uint32_t QpmWs_Rol(uint32_t v, unsigned n) { return (v << n) | (v >> (32U - n)); }

static void QpmSha1_Process(QpmSha1 *s, const uint8_t block[64])
{
    uint32_t w[80], a, b, c, d, e, f, k, temp;
    int i;
    for (i = 0; i < 16; ++i)
        w[i] = ((uint32_t)block[i * 4] << 24) | ((uint32_t)block[i * 4 + 1] << 16) | ((uint32_t)block[i * 4 + 2] << 8) | block[i * 4 + 3];
    for (i = 16; i < 80; ++i) w[i] = QpmWs_Rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    a = s->h[0]; b = s->h[1]; c = s->h[2]; d = s->h[3]; e = s->h[4];
    for (i = 0; i < 80; ++i)
    {
        if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999U; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1U; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDCU; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6U; }
        temp = QpmWs_Rol(a, 5) + f + e + k + w[i];
        e = d; d = c; c = QpmWs_Rol(b, 30); b = a; a = temp;
    }
    s->h[0] += a; s->h[1] += b; s->h[2] += c; s->h[3] += d; s->h[4] += e;
}

static void QpmSha1_Init(QpmSha1 *s)
{
    memset(s, 0, sizeof(*s));
    s->h[0] = 0x67452301U; s->h[1] = 0xEFCDAB89U; s->h[2] = 0x98BADCFEU; s->h[3] = 0x10325476U; s->h[4] = 0xC3D2E1F0U;
}

static void QpmSha1_Update(QpmSha1 *s, const void *data, size_t size)
{
    const uint8_t *p = (const uint8_t *)data;
    s->length += (uint64_t)size * 8U;
    while (size)
    {
        size_t n = 64U - s->used; if (n > size) n = size;
        memcpy(s->block + s->used, p, n); s->used += n; p += n; size -= n;
        if (s->used == 64U) { QpmSha1_Process(s, s->block); s->used = 0; }
    }
}

static void QpmSha1_Final(QpmSha1 *s, uint8_t out[20])
{
    int i;
    s->block[s->used++] = 0x80U;
    if (s->used > 56U) { while (s->used < 64U) s->block[s->used++] = 0; QpmSha1_Process(s, s->block); s->used = 0; }
    while (s->used < 56U) s->block[s->used++] = 0;
    for (i = 7; i >= 0; --i) s->block[s->used++] = (uint8_t)(s->length >> (i * 8));
    QpmSha1_Process(s, s->block);
    for (i = 0; i < 5; ++i) { out[i * 4] = (uint8_t)(s->h[i] >> 24); out[i * 4 + 1] = (uint8_t)(s->h[i] >> 16); out[i * 4 + 2] = (uint8_t)(s->h[i] >> 8); out[i * 4 + 3] = (uint8_t)s->h[i]; }
}

/* Simpler, correct base64 used for the fixed 16/20-byte handshake material. */
static size_t QpmWs_Base64Fixed(const uint8_t *data, size_t size, char *out, size_t capacity)
{
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    size_t i, o = 0;
    for (i = 0; i < size; i += 3)
    {
        uint32_t a = data[i]; uint32_t b = i + 1 < size ? data[i + 1] : 0; uint32_t c = i + 2 < size ? data[i + 2] : 0;
        uint32_t v = (a << 16) | (b << 8) | c;
        if (o + 4U >= capacity) return 0;
        out[o++] = table[(v >> 18) & 63U]; out[o++] = table[(v >> 12) & 63U];
        out[o++] = i + 1 < size ? table[(v >> 6) & 63U] : '=';
        out[o++] = i + 2 < size ? table[v & 63U] : '=';
    }
    out[o] = '\0'; return o;
}

static int QpmWs_ParseUrl(const char *url, char *host, size_t hostCap, uint16_t *port, char *path, size_t pathCap)
{
    const char *start, *slash, *colon = NULL, *p; size_t n;
    if (!url || strncmp(url, "ws://", 5) != 0) return -1;
    start = url + 5; slash = strchr(start, '/'); if (!slash) slash = start + strlen(start);
    for (p = start; p < slash; ++p) if (*p == ':') colon = p;
    n = (size_t)((colon ? colon : slash) - start); if (!n || n >= hostCap) return -2;
    memcpy(host, start, n); host[n] = '\0'; *port = 80;
    if (colon) { long v = strtol(colon + 1, NULL, 10); if (v <= 0 || v > 65535) return -3; *port = (uint16_t)v; }
    snprintf(path, pathCap, "%s", *slash ? slash : "/"); return 0;
}

static uint32_t QpmWs_NextMask(QpmWebSocket *ws)
{
    ws->maskState = ws->maskState * 1664525U + 1013904223U;
    return ws->maskState;
}

void QpmWebSocket_Init(QpmWebSocket *ws)
{
    if (!ws) return;
    memset(ws, 0, sizeof(*ws)); ws->socketHandle = QPM_SOCKET_INVALID; ws->maskState = (uint32_t)time(NULL) ^ 0xC0DEC0DEU;
}

int QpmWebSocket_Connect(QpmWebSocket *ws, const char *url, const char *subprotocol, const char *extraHeaders, int timeoutMs)
{
    char host[256], path[1024], request[4096], response[QPM_WS_HANDSHAKE_MAX], key[64], expected[64], acceptInput[128];
    uint16_t port; uint8_t seed[16], digest[20]; QpmSha1 sha; size_t used = 0; int rc, i;
    static const char guid[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    if (!ws || !url) return -1;
    rc = QpmWs_ParseUrl(url, host, sizeof(host), &port, path, sizeof(path)); if (rc != 0) return -2;
    QpmWebSocket_Close(ws, 1000, NULL);
    if (QpmSocket_Startup() != 0) return -3;
    ws->socketHandle = QpmSocket_TcpConnect(host, port, timeoutMs);
    if (ws->socketHandle == QPM_SOCKET_INVALID) { QpmSocket_Cleanup(); QpmWebSocket_Init(ws); return -4; }
    for (i = 0; i < 16; ++i) { uint32_t m = QpmWs_NextMask(ws); seed[i] = (uint8_t)(m >> ((i & 3) * 8)); }
    if (!QpmWs_Base64Fixed(seed, sizeof(seed), key, sizeof(key))) goto fail;
    rc = snprintf(request, sizeof(request), "GET %s HTTP/1.1\r\nHost: %s%s%u\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n%s%s%s\r\n",
                  path, host, port == 80 ? "" : ":", port == 80 ? 0U : (unsigned)port, key,
                  subprotocol ? "Sec-WebSocket-Protocol: " : "", subprotocol ? subprotocol : "", subprotocol ? "\r\n" : "");
    if (port != 80)
        rc = snprintf(request, sizeof(request), "GET %s HTTP/1.1\r\nHost: %s:%u\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n%s%s%s%s\r\n",
                      path, host, (unsigned)port, key, subprotocol ? "Sec-WebSocket-Protocol: " : "", subprotocol ? subprotocol : "", subprotocol ? "\r\n" : "", extraHeaders ? extraHeaders : "");
    else
        rc = snprintf(request, sizeof(request), "GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n%s%s%s%s\r\n",
                      path, host, key, subprotocol ? "Sec-WebSocket-Protocol: " : "", subprotocol ? subprotocol : "", subprotocol ? "\r\n" : "", extraHeaders ? extraHeaders : "");
    if (rc < 0 || (size_t)rc >= sizeof(request) || QpmSocket_SendAll(ws->socketHandle, request, (size_t)rc) != rc) goto fail;
    response[0] = '\0';
    while (used + 1U < sizeof(response))
    {
        char ch; int n = QpmSocket_Receive(ws->socketHandle, &ch, 1, timeoutMs); if (n <= 0) goto fail;
        response[used++] = ch; response[used] = '\0'; if (used >= 4U && memcmp(response + used - 4U, "\r\n\r\n", 4) == 0) break;
    }
    if (strstr(response, " 101 ") == NULL) goto fail;
    snprintf(acceptInput, sizeof(acceptInput), "%s%s", key, guid); QpmSha1_Init(&sha); QpmSha1_Update(&sha, acceptInput, strlen(acceptInput)); QpmSha1_Final(&sha, digest);
    if (!QpmWs_Base64Fixed(digest, sizeof(digest), expected, sizeof(expected))) goto fail;
    {
        char needle[128]; snprintf(needle, sizeof(needle), "Sec-WebSocket-Accept: %s", expected); if (!strstr(response, needle)) goto fail;
    }
    ws->connected = 1; return 0;
fail:
    QpmSocket_Close(ws->socketHandle); QpmSocket_Cleanup(); QpmWebSocket_Init(ws); return -5;
}

int QpmWebSocket_Send(QpmWebSocket *ws, QpmWebSocketOpcode opcode, const void *payload, size_t payloadSize)
{
    uint8_t header[14], mask[4]; size_t h = 0, i; uint32_t m; const uint8_t *src = (const uint8_t *)payload; uint8_t chunk[1024];
    if (!ws || !ws->connected || (!payload && payloadSize)) return -1;
    if ((opcode & 0x8) && payloadSize > 125U) return -2;
    header[h++] = (uint8_t)(0x80U | (uint8_t)opcode);
    if (payloadSize <= 125U) header[h++] = (uint8_t)(0x80U | payloadSize);
    else if (payloadSize <= 65535U) { header[h++] = 0x80U | 126U; header[h++] = (uint8_t)(payloadSize >> 8); header[h++] = (uint8_t)payloadSize; }
    else { int shift; header[h++] = 0x80U | 127U; for (shift = 56; shift >= 0; shift -= 8) header[h++] = (uint8_t)(((uint64_t)payloadSize) >> shift); }
    m = QpmWs_NextMask(ws); mask[0] = (uint8_t)m; mask[1] = (uint8_t)(m >> 8); mask[2] = (uint8_t)(m >> 16); mask[3] = (uint8_t)(m >> 24);
    memcpy(header + h, mask, 4); h += 4;
    if (QpmSocket_SendAll(ws->socketHandle, header, h) != (int)h) return -3;
    i = 0;
    while (i < payloadSize)
    {
        size_t n = payloadSize - i; size_t j; if (n > sizeof(chunk)) n = sizeof(chunk);
        for (j = 0; j < n; ++j) chunk[j] = src[i + j] ^ mask[(i + j) & 3U];
        if (QpmSocket_SendAll(ws->socketHandle, chunk, n) != (int)n) return -4;
        i += n;
    }
    return 0;
}

int QpmWebSocket_SendText(QpmWebSocket *ws, const char *text) { return text ? QpmWebSocket_Send(ws, QPM_WS_TEXT, text, strlen(text)) : -1; }
int QpmWebSocket_SendBinary(QpmWebSocket *ws, const void *data, size_t size) { return QpmWebSocket_Send(ws, QPM_WS_BINARY, data, size); }
int QpmWebSocket_Ping(QpmWebSocket *ws, const void *payload, size_t payloadSize) { return QpmWebSocket_Send(ws, QPM_WS_PING, payload, payloadSize); }
int QpmWebSocket_Pong(QpmWebSocket *ws, const void *payload, size_t payloadSize) { return QpmWebSocket_Send(ws, QPM_WS_PONG, payload, payloadSize); }

int QpmWebSocket_Receive(QpmWebSocket *ws, QpmWebSocketFrame *frame, void *payload, size_t payloadCapacity, int timeoutMs)
{
    uint8_t head[2], mask[4] = {0,0,0,0}; uint64_t length; int masked; size_t i; uint8_t *out = (uint8_t *)payload;
    if (!ws || !ws->connected || !frame || (!payload && payloadCapacity)) return -1;
    if (QpmSocket_ReceiveExact(ws->socketHandle, head, 2, timeoutMs) != 2) return 0;
    frame->fin = (head[0] & 0x80U) != 0; frame->opcode = (QpmWebSocketOpcode)(head[0] & 0x0FU); masked = (head[1] & 0x80U) != 0; length = head[1] & 0x7FU;
    if (length == 126U) { uint8_t ext[2]; if (QpmSocket_ReceiveExact(ws->socketHandle, ext, 2, timeoutMs) != 2) return -2; length = ((uint64_t)ext[0] << 8) | ext[1]; }
    else if (length == 127U) { uint8_t ext[8]; int j; length = 0; if (QpmSocket_ReceiveExact(ws->socketHandle, ext, 8, timeoutMs) != 8) return -2; for (j = 0; j < 8; ++j) length = (length << 8) | ext[j]; }
    if (length > payloadCapacity || length > (uint64_t)SIZE_MAX) return -3;
    if (masked && QpmSocket_ReceiveExact(ws->socketHandle, mask, 4, timeoutMs) != 4) return -4;
    if (length && QpmSocket_ReceiveExact(ws->socketHandle, out, (size_t)length, timeoutMs) != (int)length) return -5;
    if (masked) for (i = 0; i < (size_t)length; ++i) out[i] ^= mask[i & 3U];
    frame->payloadSize = (size_t)length;
    if (frame->opcode == QPM_WS_PING) (void)QpmWebSocket_Pong(ws, out, frame->payloadSize);
    return 1;
}

void QpmWebSocket_Close(QpmWebSocket *ws, uint16_t statusCode, const char *reason)
{
    if (!ws) return;
    if (ws->connected)
    {
        uint8_t payload[125]; size_t n = 0, reasonLen = reason ? strlen(reason) : 0;
        if (reasonLen > 123U) reasonLen = 123U;
        if (statusCode) { payload[n++] = (uint8_t)(statusCode >> 8); payload[n++] = (uint8_t)statusCode; }
        if (reasonLen) { memcpy(payload + n, reason, reasonLen); n += reasonLen; }
        (void)QpmWebSocket_Send(ws, QPM_WS_CLOSE, payload, n);
    }
    if (ws->socketHandle != QPM_SOCKET_INVALID) { QpmSocket_Close(ws->socketHandle); QpmSocket_Cleanup(); }
    QpmWebSocket_Init(ws);
}

const char *QpmWebSocket_ResultText(int result)
{
    if (result == 0) return "OK";
    if (result == -2) return "Only ws:// is supported by this dependency-free bundle; use a TLS transport for wss://";
    return result > 0 ? "WebSocket frame received" : "WebSocket operation failed";
}
