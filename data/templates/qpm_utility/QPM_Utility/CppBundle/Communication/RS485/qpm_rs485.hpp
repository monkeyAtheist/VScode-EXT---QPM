#pragma once
#include "qpm_rs485.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

namespace qpm {
class Rs485Bus {
public:
    Rs485Bus() { QpmRs485_Init(&bus_); }
    ~Rs485Bus() { QpmRs485_Close(&bus_); }
    Rs485Bus(const Rs485Bus&) = delete;
    Rs485Bus& operator=(const Rs485Bus&) = delete;
    Rs485Bus(Rs485Bus&& other) noexcept : bus_(other.bus_) { QpmRs485_Init(&other.bus_); }
    Rs485Bus& operator=(Rs485Bus&& other) noexcept { if (this != &other) { QpmRs485_Close(&bus_); bus_ = other.bus_; QpmRs485_Init(&other.bus_); } return *this; }

    void open(const std::string& port, const QpmRs485Config& config) { if (QpmRs485_Open(&bus_, port.c_str(), &config) != 0) throw std::runtime_error("RS-485 open failed"); }
    void close() { QpmRs485_Close(&bus_); }
    bool isOpen() const { return QpmUart_IsOpen(&bus_.uart) != 0; }
    void write(const void* data, std::size_t size) { if (QpmRs485_Write(&bus_, data, size) < 0) throw std::runtime_error("RS-485 write failed"); }
    std::vector<std::uint8_t> read(std::size_t capacity, std::chrono::milliseconds timeout) { std::vector<std::uint8_t> out(capacity); int n = QpmRs485_Read(&bus_, out.data(), out.size(), static_cast<int>(timeout.count())); if (n < 0) throw std::runtime_error("RS-485 read failed"); out.resize(static_cast<std::size_t>(n)); return out; }
    QpmRs485* nativeHandle() { return &bus_; }
private:
    QpmRs485 bus_{};
};
}
