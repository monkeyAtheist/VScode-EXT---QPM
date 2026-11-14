#ifndef QPM_MQTT_AUTO_H
#define QPM_MQTT_AUTO_H
#include "qpm_mqtt.h"
#include "qpm_retry.h"
#ifdef __cplusplus
extern "C" {
#endif
#define QPM_MQTT_AUTO_SUBSCRIPTIONS 16
typedef struct QpmMqttAutoSubscription { char topic[256]; int qos; } QpmMqttAutoSubscription;
typedef struct QpmMqttAuto { QpmMqttClient client; QpmMqttConnectOptions options; QpmRetryPolicy retry; char host[256],clientId[128],username[128],password[128]; uint16_t port; int timeoutMs; QpmMqttAutoSubscription subscriptions[QPM_MQTT_AUTO_SUBSCRIPTIONS]; size_t subscriptionCount; } QpmMqttAuto;
void QpmMqttAuto_Init(QpmMqttAuto *client);
int QpmMqttAuto_Configure(QpmMqttAuto *client,const char *host,uint16_t port,const char *clientId,const char *username,const char *password,int timeoutMs);
int QpmMqttAuto_AddSubscription(QpmMqttAuto *client,const char *topic,int qos);
int QpmMqttAuto_Connect(QpmMqttAuto *client);
int QpmMqttAuto_EnsureConnected(QpmMqttAuto *client);
int QpmMqttAuto_Publish(QpmMqttAuto *client,const char *topic,const void *payload,size_t payloadSize,int qos,int retained);
int QpmMqttAuto_Receive(QpmMqttAuto *client,QpmMqttMessage *message,void *payload,size_t capacity,int timeoutMs);
void QpmMqttAuto_Disconnect(QpmMqttAuto *client);
#ifdef __cplusplus
}
#endif
#endif
