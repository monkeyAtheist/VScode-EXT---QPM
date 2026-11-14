#ifndef QPM_MQTT_H
#define QPM_MQTT_H

#include <stddef.h>
#include <stdint.h>
#include "qpm_socket.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmMqttConnectOptions
{
    const char *clientId;
    const char *username;
    const char *password;
    const char *willTopic;
    const void *willPayload;
    size_t willPayloadSize;
    int willQos;
    int willRetain;
    int cleanSession;
    uint16_t keepAliveSeconds;
} QpmMqttConnectOptions;

typedef struct QpmMqttClient
{
    QpmSocketHandle socketHandle;
    uint16_t nextPacketId;
    uint16_t keepAliveSeconds;
    int connected;
} QpmMqttClient;

typedef struct QpmMqttMessage
{
    char topic[256];
    size_t payloadSize;
    int qos;
    int retained;
    int duplicate;
    uint16_t packetId;
} QpmMqttMessage;

void QpmMqtt_DefaultConnectOptions(QpmMqttConnectOptions *options);
void QpmMqtt_Init(QpmMqttClient *client);
int QpmMqtt_Connect(QpmMqttClient *client, const char *host, uint16_t port,
                    const QpmMqttConnectOptions *options, int timeoutMs);
void QpmMqtt_Disconnect(QpmMqttClient *client);
int QpmMqtt_Publish(QpmMqttClient *client, const char *topic, const void *payload, size_t payloadSize,
                    int qos, int retained, int timeoutMs);
int QpmMqtt_Subscribe(QpmMqttClient *client, const char *topicFilter, int qos, int timeoutMs);
int QpmMqtt_Unsubscribe(QpmMqttClient *client, const char *topicFilter, int timeoutMs);
int QpmMqtt_Ping(QpmMqttClient *client, int timeoutMs);
int QpmMqtt_Receive(QpmMqttClient *client, QpmMqttMessage *message,
                    void *payload, size_t payloadCapacity, int timeoutMs);
const char *QpmMqtt_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
