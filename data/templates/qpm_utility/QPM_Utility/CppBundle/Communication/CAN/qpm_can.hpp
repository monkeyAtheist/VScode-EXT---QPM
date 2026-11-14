#pragma once
#include "qpm_can.h"
#include <chrono>
#include <string>
#include <utility>
#include <vector>

namespace qpm
{
class CanBus
{
public:
    CanBus() { QpmCan_Init(&bus_); }
    ~CanBus() { QpmCan_Close(&bus_); }
    CanBus(const CanBus&) = delete;
    CanBus& operator=(const CanBus&) = delete;
    CanBus(CanBus&& other) noexcept : bus_(other.bus_) { QpmCan_Init(&other.bus_); }
    CanBus& operator=(CanBus&& other) noexcept { if (this != &other) { QpmCan_Close(&bus_); bus_ = other.bus_; QpmCan_Init(&other.bus_); } return *this; }
    bool open(const std::string& interfaceName, bool canFd = false) { return QpmCan_Open(&bus_, interfaceName.c_str(), canFd ? 1 : 0) == 0; }
    void close() { QpmCan_Close(&bus_); }
    bool send(const QpmCanFrame& frame) { return QpmCan_Send(&bus_, &frame) == 0; }
    bool receive(QpmCanFrame& frame, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}) { return QpmCan_Receive(&bus_, &frame, static_cast<int>(timeout.count())) > 0; }
    bool setFilters(const std::vector<QpmCanFilter>& filters) { return QpmCan_SetFilters(&bus_, filters.data(), filters.size()) == 0; }
    bool clearFilters() { return QpmCan_ClearFilters(&bus_) == 0; }
    bool setLoopback(bool enabled) { return QpmCan_SetLoopback(&bus_, enabled ? 1 : 0) == 0; }
private:
    QpmCan bus_{};
};
}
