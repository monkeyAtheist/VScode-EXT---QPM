#pragma once
#include "qpm_lin.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

namespace qpm {
class LinMaster {
public:
    LinMaster() { QpmLin_Init(&lin_); }
    ~LinMaster() { QpmLin_Close(&lin_); }
    LinMaster(const LinMaster&) = delete;
    LinMaster& operator=(const LinMaster&) = delete;
    LinMaster(LinMaster&& other) noexcept : lin_(other.lin_) { QpmLin_Init(&other.lin_); }
    LinMaster& operator=(LinMaster&& other) noexcept { if (this != &other) { QpmLin_Close(&lin_); lin_ = other.lin_; QpmLin_Init(&other.lin_); } return *this; }

    void open(const std::string& port, const QpmLinConfig& config) { if (QpmLin_Open(&lin_, port.c_str(), &config) != 0) throw std::runtime_error("LIN open failed"); }
    void close() { QpmLin_Close(&lin_); }
    void publish(std::uint8_t id, const std::vector<std::uint8_t>& data, QpmLinChecksumMode mode = QPM_LIN_CHECKSUM_AUTO) { if (QpmLin_Publish(&lin_, id, data.data(), data.size(), mode) != 0) throw std::runtime_error("LIN publish failed"); }
    std::vector<std::uint8_t> request(std::uint8_t id, std::size_t length, std::chrono::milliseconds timeout, QpmLinChecksumMode mode = QPM_LIN_CHECKSUM_AUTO) { std::vector<std::uint8_t> out(length); int rc = QpmLin_Request(&lin_, id, out.data(), out.size(), mode, static_cast<int>(timeout.count())); if (rc < 0) throw std::runtime_error("LIN request failed"); return out; }
    static std::uint8_t protectedId(std::uint8_t id) { return QpmLin_ProtectedId(id); }
    static std::uint8_t checksum(std::uint8_t pid, const std::vector<std::uint8_t>& data, QpmLinChecksumMode mode = QPM_LIN_CHECKSUM_AUTO) { return QpmLin_Checksum(pid, data.data(), data.size(), mode); }
private:
    QpmLin lin_{};
};
}
