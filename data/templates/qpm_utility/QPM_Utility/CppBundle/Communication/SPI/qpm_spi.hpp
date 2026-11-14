#pragma once
#include "qpm_spi.h"
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace qpm
{
class SpiDevice
{
public:
    SpiDevice() { QpmSpi_Init(&spi_); }
    ~SpiDevice() { QpmSpi_Close(&spi_); }
    SpiDevice(const SpiDevice&) = delete;
    SpiDevice& operator=(const SpiDevice&) = delete;
    SpiDevice(SpiDevice&& other) noexcept : spi_(other.spi_) { QpmSpi_Init(&other.spi_); }
    SpiDevice& operator=(SpiDevice&& other) noexcept { if (this != &other) { QpmSpi_Close(&spi_); spi_ = other.spi_; QpmSpi_Init(&other.spi_); } return *this; }
    bool open(const std::string& path, std::uint32_t speedHz, std::uint8_t mode = 0, std::uint8_t bits = 8) { return QpmSpi_Open(&spi_, path.c_str(), speedHz, mode, bits) == 0; }
    void close() { QpmSpi_Close(&spi_); }
    bool configure(std::uint32_t speedHz, std::uint8_t mode, std::uint8_t bits = 8) { return QpmSpi_Configure(&spi_, speedHz, mode, bits) == 0; }
    bool transfer(const void* tx, void* rx, std::size_t size) { return QpmSpi_Transfer(&spi_, tx, rx, size) == 0; }
    std::vector<std::uint8_t> transfer(const std::vector<std::uint8_t>& tx) { std::vector<std::uint8_t> rx(tx.size()); if (!transfer(tx.data(), rx.data(), tx.size())) rx.clear(); return rx; }
    std::vector<std::uint8_t> read(std::size_t count, std::uint8_t fill = 0xFF) { std::vector<std::uint8_t> rx(count); if (QpmSpi_Read(&spi_, rx.data(), count, fill) != 0) rx.clear(); return rx; }
private:
    QpmSpi spi_{};
};
}
