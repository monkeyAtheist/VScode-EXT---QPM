#pragma once
#include "qpm_hid.h"
#include <chrono>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace qpm {
class HidDevice {
public:
    HidDevice() { QpmHid_Init(&device_); }
    ~HidDevice() { QpmHid_Close(&device_); }
    HidDevice(const HidDevice&) = delete;
    HidDevice& operator=(const HidDevice&) = delete;
    HidDevice(HidDevice&& other) noexcept : device_(other.device_) { QpmHid_Init(&other.device_); }
    HidDevice& operator=(HidDevice&& other) noexcept { if (this != &other) { QpmHid_Close(&device_); device_ = other.device_; QpmHid_Init(&other.device_); } return *this; }
    void open(std::uint16_t vid, std::uint16_t pid, const wchar_t* serial = nullptr) { if (QpmHid_OpenVidPid(&device_, vid, pid, serial) != 0) throw std::runtime_error("USB HID open failed"); }
    void openPath(const std::string& path) { if (QpmHid_OpenPath(&device_, path.c_str()) != 0) throw std::runtime_error("USB HID open failed"); }
    void close() { QpmHid_Close(&device_); }
    std::vector<std::uint8_t> read(std::size_t capacity, std::chrono::milliseconds timeout) { std::vector<std::uint8_t> out(capacity); int n = QpmHid_Read(&device_, out.data(), out.size(), static_cast<int>(timeout.count())); if (n < 0) throw std::runtime_error(QpmHid_ResultText(n)); out.resize(static_cast<std::size_t>(n)); return out; }
    void write(const std::vector<std::uint8_t>& report) { if (QpmHid_Write(&device_, report.data(), report.size()) < 0) throw std::runtime_error("USB HID write failed"); }
    QpmHidDevice* nativeHandle() { return &device_; }
private:
    QpmHidDevice device_{};
};
}
