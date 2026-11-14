#include "qpm_mqtt.h"

#include <stdio.h>
#include <string.h>

#define QPM_MQTT_PACKET_MAX 4096U

static size_t QpmMqtt_EncodeRemainingLength(size_t value, uint8_t out[4])
{
    size_t n = 0;
    do
    {
        uint8_t byte = (uint8_t)(value % 128U);
        value /= 128U;
        if (value) byte |= 0x80U;
        out[n++] = byte;
    } while (value && n < 4U);
    return n;
}

static int QpmMqtt_ReadRemainingLength(QpmMqttClient *client, size_t *value, int timeoutMs)
{
    size_t multiplier = 1, result = 0;
    int count = 0;
    for (;;)
    {
        uint8_t byte;
        int rc = QpmSocket_ReceiveExact(client->socketHandle, &byte, 1U, timeoutMs);
        if (rc != 1) return -1;
        result += (size_t)(byte & 0x7FU) * multiplier;
        ++count;
        if (!(byte & 0x80U)) break;
        if (count >= 4) return -2;
        multiplier *= 128U;
    }
    *value = result;
    return 0;
}

static int QpmMqtt_PutString(uint8_t *buffer, size_t capacity, size_t *offset, const char *text)
{
    size_t length = text ? strlen(text) : 0U;
    if (length > 65535U || *offset + 2U + length > capacity) return -1;
    buffer[(*offset)++] = (uint8_t)(length >> 8);
    buffer[(*offset)++] = (uint8_t)length;
    if (length) { memcpy(buffer + *offset, text, length); *offset += length; }
    return 0;
}

static int QpmMqtt_PutBinary(uint8_t *buffer, size_t capacity, size_t *offset, const void *data, size_t size)
{
    if (size > 65535U || *offset + 2U + size > capacity) return -1;
    buffer[(*offset)++] = (uint8_t)(size >> 8);
    buffer[(*offset)++] = (uint8_t)size;
    if (size) { memcpy(buffer + *offset, data, size); *offset += size; }
    return 0;
}

static uint16_t QpmMqtt_NextPacketId(QpmMqttClient *client)
{
    ++client->nextPacketId;
    if (!client->nextPacketId) client->nextPacketId = 1;
    return client->nextPacketId;
}

static int QpmMqtt_SendPacket(QpmMqttClient *client, uint8_t firstByte, const void *body, size_t bodySize)
{
    uint8_t header[5];
    size_t n;
    if (!client || client->socketHandle == QPM_SOCKET_INVALID || bodySize > 268435455U) return -1;
    header[0] = firstByte;
    n = QpmMqtt_EncodeRemainingLength(bodySize, header + 1);
    if (QpmSocket_SendAll(client->socketHandle, header, n + 1U) != (int)(n + 1U)) return -2;
    if (bodySize && QpmSocket_SendAll(client->socketHandle, body, bodySize) != (int)bodySize) return -3;
    return 0;
}

static int QpmMqtt_ReadControl(QpmMqttClient *client, uint8_t expectedType, uint16_t expectedPacketId, int timeoutMs)
{
    uint8_t first;
    size_t remaining;
    uint8_t body[16];
    int rc;
    if (QpmSocket_ReceiveExact(client->socketHandle, &first, 1U, timeoutMs) != 1) return -1;
    if ((first >> 4) != expectedType) return -2;
    rc = QpmMqtt_ReadRemainingLength(client, &remaining, timeoutMs); if (rc != 0) return -3;
    if (remaining > sizeof(body)) return -4;
    if (remaining && QpmSocket_ReceiveExact(client->socketHandle, body, remaining, timeoutMs) != (int)remaining) return -5;
    if (expectedPacketId)
    {
        if (remaining < 2U) return -6;
        if ((uint16_t)(((uint16_t)body[0] << 8) | body[1]) != expectedPacketId) return -7;
    }
    return remaining ? body[remaining - 1U] : 0;
}

void QpmMqtt_DefaultConnectOptions(QpmMqttConnectOptions *options)
{
    if (!options) return;
    memset(options, 0, sizeof(*options));
    options->clientId = "qpm-client";
    options->cleanSession = 1;
    options->keepAliveSeconds = 30;
}

void QpmMqtt_Init(QpmMqttClient *client)
{
    if (!client) return;
    memset(client, 0, sizeof(*client));
    client->socketHandle = QPM_SOCKET_INVALID;
}

int QpmMqtt_Connect(QpmMqttClient *client, const char *host, uint16_t port,
                    const QpmMqttConnectOptions *options, int timeoutMs)
{
    QpmMqttConnectOptions local;
    uint8_t body[QPM_MQTT_PACKET_MAX];
    size_t offset = 0;
    uint8_t flags = 0;
    uint8_t first;
    size_t remaining;
    uint8_t connack[2];
    if (!client || !host) return -1;
    if (!options) { QpmMqtt_DefaultConnectOptions(&local); options = &local; }
    if (options->willQos < 0 || options->willQos > 2) return -2;
    QpmMqtt_Disconnect(client);
    if (QpmSocket_Startup() != 0) return -3;
    client->socketHandle = QpmSocket_TcpConnect(host, port ? port : 1883U, timeoutMs);
    if (client->socketHandle == QPM_SOCKET_INVALID) { QpmSocket_Cleanup(); return -4; }
    if (QpmMqtt_PutString(body, sizeof(body), &offset, "MQTT") != 0) goto too_large;
    body[offset++] = 4U; /* MQTT 3.1.1 */
    if (options->username) flags |= 0x80U;
    if (options->password) flags |= 0x40U;
    if (options->willTopic)
    {
        flags |= 0x04U;
        flags |= (uint8_t)((options->willQos & 3) << 3);
        if (options->willRetain) flags |= 0x20U;
    }
    if (options->cleanSession) flags |= 0x02U;
    body[offset++] = flags;
    body[offset++] = (uint8_t)(options->keepAliveSeconds >> 8);
    body[offset++] = (uint8_t)options->keepAliveSeconds;
    if (QpmMqtt_PutString(body, sizeof(body), &offset, options->clientId ? options->clientId : "") != 0) goto too_large;
    if (options->willTopic)
    {
        if (QpmMqtt_PutString(body, sizeof(body), &offset, options->willTopic) != 0) goto too_large;
        if (QpmMqtt_PutBinary(body, sizeof(body), &offset, options->willPayload, options->willPayloadSize) != 0) goto too_large;
    }
    if (options->username && QpmMqtt_PutString(body, sizeof(body), &offset, options->username) != 0) goto too_large;
    if (options->password && QpmMqtt_PutString(body, sizeof(body), &offset, options->password) != 0) goto too_large;
    if (QpmMqtt_SendPacket(client, 0x10U, body, offset) != 0) goto io_error;
    if (QpmSocket_ReceiveExact(client->socketHandle, &first, 1U, timeoutMs) != 1 || (first >> 4) != 2U) goto io_error;
    if (QpmMqtt_ReadRemainingLength(client, &remaining, timeoutMs) != 0 || remaining != 2U) goto io_error;
    if (QpmSocket_ReceiveExact(client->socketHandle, connack, 2U, timeoutMs) != 2) goto io_error;
    if (connack[1] != 0U) { int code = -(100 + (int)connack[1]); QpmMqtt_Disconnect(client); return code; }
    client->keepAliveSeconds = options->keepAliveSeconds;
    client->connected = 1;
    return 0;
too_large:
    QpmMqtt_Disconnect(client); return -5;
io_error:
    QpmMqtt_Disconnect(client); return -6;
}

void QpmMqtt_Disconnect(QpmMqttClient *client)
{
    if (!client) return;
    if (client->socketHandle != QPM_SOCKET_INVALID)
    {
        if (client->connected) (void)QpmMqtt_SendPacket(client, 0xE0U, NULL, 0);
        QpmSocket_Close(client->socketHandle);
        QpmSocket_Cleanup();
    }
    QpmMqtt_Init(client);
}

int QpmMqtt_Publish(QpmMqttClient *client, const char *topic, const void *payload, size_t payloadSize,
                    int qos, int retained, int timeoutMs)
{
    uint8_t body[QPM_MQTT_PACKET_MAX];
    size_t offset = 0;
    uint16_t packetId = 0;
    uint8_t first = 0x30U;
    if (!client || !client->connected || !topic || (!payload && payloadSize) || qos < 0 || qos > 1) return -1;
    if (QpmMqtt_PutString(body, sizeof(body), &offset, topic) != 0) return -2;
    if (qos)
    {
        packetId = QpmMqtt_NextPacketId(client);
        if (offset + 2U > sizeof(body)) return -2;
        body[offset++] = (uint8_t)(packetId >> 8); body[offset++] = (uint8_t)packetId;
        first |= 0x02U;
    }
    if (retained) first |= 0x01U;
    if (payloadSize > sizeof(body) - offset) return -2;
    if (payloadSize) { memcpy(body + offset, payload, payloadSize); offset += payloadSize; }
    if (QpmMqtt_SendPacket(client, first, body, offset) != 0) return -3;
    if (qos) return QpmMqtt_ReadControl(client, 4U, packetId, timeoutMs) >= 0 ? 0 : -4;
    return 0;
}

int QpmMqtt_Subscribe(QpmMqttClient *client, const char *topicFilter, int qos, int timeoutMs)
{
    uint8_t body[1024]; size_t offset = 0; uint16_t packetId; int rc;
    if (!client || !client->connected || !topicFilter || qos < 0 || qos > 1) return -1;
    packetId = QpmMqtt_NextPacketId(client);
    body[offset++] = (uint8_t)(packetId >> 8); body[offset++] = (uint8_t)packetId;
    if (QpmMqtt_PutString(body, sizeof(body), &offset, topicFilter) != 0 || offset >= sizeof(body)) return -2;
    body[offset++] = (uint8_t)qos;
    if (QpmMqtt_SendPacket(client, 0x82U, body, offset) != 0) return -3;
    rc = QpmMqtt_ReadControl(client, 9U, packetId, timeoutMs);
    return rc == 0x80 ? -5 : (rc >= 0 ? 0 : -4);
}

int QpmMqtt_Unsubscribe(QpmMqttClient *client, const char *topicFilter, int timeoutMs)
{
    uint8_t body[1024]; size_t offset = 0; uint16_t packetId;
    if (!client || !client->connected || !topicFilter) return -1;
    packetId = QpmMqtt_NextPacketId(client);
    body[offset++] = (uint8_t)(packetId >> 8); body[offset++] = (uint8_t)packetId;
    if (QpmMqtt_PutString(body, sizeof(body), &offset, topicFilter) != 0) return -2;
    if (QpmMqtt_SendPacket(client, 0xA2U, body, offset) != 0) return -3;
    return QpmMqtt_ReadControl(client, 11U, packetId, timeoutMs) >= 0 ? 0 : -4;
}

int QpmMqtt_Ping(QpmMqttClient *client, int timeoutMs)
{
    if (!client || !client->connected) return -1;
    if (QpmMqtt_SendPacket(client, 0xC0U, NULL, 0) != 0) return -2;
    return QpmMqtt_ReadControl(client, 13U, 0, timeoutMs) >= 0 ? 0 : -3;
}

int QpmMqtt_Receive(QpmMqttClient *client, QpmMqttMessage *message,
                    void *payload, size_t payloadCapacity, int timeoutMs)
{
    uint8_t first;
    size_t remaining, topicLength, consumed = 0;
    uint8_t *out = (uint8_t *)payload;
    int rc;
    if (!client || !client->connected || !message || (!payload && payloadCapacity)) return -1;
    memset(message, 0, sizeof(*message));
    rc = QpmSocket_ReceiveExact(client->socketHandle, &first, 1U, timeoutMs);
    if (rc != 1) return rc == 0 ? 0 : -2;
    if (QpmMqtt_ReadRemainingLength(client, &remaining, timeoutMs) != 0) return -3;
    if ((first >> 4) != 3U)
    {
        uint8_t discard[256]; size_t left = remaining;
        while (left) { size_t n = left > sizeof(discard) ? sizeof(discard) : left; rc = QpmSocket_ReceiveExact(client->socketHandle, discard, n, timeoutMs); if (rc != (int)n) return -4; left -= n; }
        return 1; /* Non-PUBLISH packet consumed. */
    }
    {
        uint8_t lenBytes[2];
        if (remaining < 2U || QpmSocket_ReceiveExact(client->socketHandle, lenBytes, 2U, timeoutMs) != 2) return -5;
        topicLength = ((size_t)lenBytes[0] << 8) | lenBytes[1]; consumed = 2U;
    }
    if (topicLength >= sizeof(message->topic) || topicLength > remaining - consumed) return -6;
    if (QpmSocket_ReceiveExact(client->socketHandle, message->topic, topicLength, timeoutMs) != (int)topicLength) return -7;
    message->topic[topicLength] = '\0'; consumed += topicLength;
    message->qos = (first >> 1) & 3; message->retained = first & 1; message->duplicate = (first >> 3) & 1;
    if (message->qos)
    {
        uint8_t id[2];
        if (remaining - consumed < 2U || QpmSocket_ReceiveExact(client->socketHandle, id, 2U, timeoutMs) != 2) return -8;
        message->packetId = (uint16_t)(((uint16_t)id[0] << 8) | id[1]); consumed += 2U;
    }
    message->payloadSize = remaining - consumed;
    if (message->payloadSize > payloadCapacity) return -9;
    if (message->payloadSize && QpmSocket_ReceiveExact(client->socketHandle, out, message->payloadSize, timeoutMs) != (int)message->payloadSize) return -10;
    if (message->qos == 1)
    {
        uint8_t ack[2] = {(uint8_t)(message->packetId >> 8), (uint8_t)message->packetId};
        if (QpmMqtt_SendPacket(client, 0x40U, ack, 2U) != 0) return -11;
    }
    return 2;
}

const char *QpmMqtt_ResultText(int result)
{
    if (result == 0) return "OK";
    if (result <= -101 && result >= -105) return "MQTT broker rejected CONNECT";
    return result > 0 ? "MQTT packet received" : "MQTT operation failed";
}
