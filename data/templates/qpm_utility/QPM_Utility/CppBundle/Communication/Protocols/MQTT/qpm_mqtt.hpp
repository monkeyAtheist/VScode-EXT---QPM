#pragma once
#include "qpm_mqtt.h"
#include <chrono>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>
#include <utility>

namespace qpm {
class MqttClient {
public:
    MqttClient() { QpmMqtt_Init(&client_); }
    ~MqttClient() { QpmMqtt_Disconnect(&client_); }
    MqttClient(const MqttClient&) = delete; MqttClient& operator=(const MqttClient&) = delete;
    MqttClient(MqttClient&& other) noexcept : client_(other.client_) { QpmMqtt_Init(&other.client_); }
    MqttClient& operator=(MqttClient&& other) noexcept { if (this != &other) { QpmMqtt_Disconnect(&client_); client_ = other.client_; QpmMqtt_Init(&other.client_); } return *this; }
    void connect(const std::string& host, std::uint16_t port, const QpmMqttConnectOptions& options, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { if (QpmMqtt_Connect(&client_, host.c_str(), port, &options, static_cast<int>(timeout.count())) != 0) throw std::runtime_error("MQTT connect failed"); }
    void disconnect() { QpmMqtt_Disconnect(&client_); }
    void publish(const std::string& topic, const void* data, std::size_t size, int qos = 0, bool retained = false, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { if (QpmMqtt_Publish(&client_, topic.c_str(), data, size, qos, retained ? 1 : 0, static_cast<int>(timeout.count())) != 0) throw std::runtime_error("MQTT publish failed"); }
    void subscribe(const std::string& filter, int qos = 0, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { if (QpmMqtt_Subscribe(&client_, filter.c_str(), qos, static_cast<int>(timeout.count())) != 0) throw std::runtime_error("MQTT subscribe failed"); }
    std::pair<QpmMqttMessage,std::vector<std::uint8_t>> receive(std::size_t maxPayload = 65536, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { QpmMqttMessage msg{}; std::vector<std::uint8_t> body(maxPayload); int rc = QpmMqtt_Receive(&client_, &msg, body.data(), body.size(), static_cast<int>(timeout.count())); if (rc <= 0) throw std::runtime_error("MQTT receive timeout/error"); body.resize(msg.payloadSize); return {msg, std::move(body)}; }
private: QpmMqttClient client_{};
};
}
