#pragma once

#include "qpm_uart.h"
#include <chrono>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace qpm
{
class SerialPort
{
public:
    SerialPort() { QpmUart_Init(&uart_); }
    ~SerialPort() { QpmUart_Close(&uart_); }
    SerialPort(const SerialPort&) = delete;
    SerialPort& operator=(const SerialPort&) = delete;
    SerialPort(SerialPort&& other) noexcept : uart_(other.uart_) { QpmUart_Init(&other.uart_); }
    SerialPort& operator=(SerialPort&& other) noexcept
    {
        if (this != &other) { QpmUart_Close(&uart_); uart_ = other.uart_; QpmUart_Init(&other.uart_); }
        return *this;
    }

    bool open(const std::string& port, const QpmUartConfig& config) { return QpmUart_OpenConfig(&uart_, port.c_str(), &config) == 0; }
    bool open(const std::string& port, int baudRate = 115200, int dataBits = 8, char parity = 'N', int stopBits = 1)
    { return QpmUart_Open(&uart_, port.c_str(), baudRate, dataBits, parity, stopBits) == 0; }
    void close() { QpmUart_Close(&uart_); }
    bool isOpen() const { return QpmUart_IsOpen(&uart_) != 0; }
    bool configure(const QpmUartConfig& config) { return QpmUart_Configure(&uart_, &config) == 0; }

    int write(const void* data, std::size_t size) { return QpmUart_Write(&uart_, data, size); }
    int writeAll(const void* data, std::size_t size) { return QpmUart_WriteAll(&uart_, data, size); }
    int write(std::string_view text) { return writeAll(text.data(), text.size()); }
    int read(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return QpmUart_Read(&uart_, data, size, static_cast<int>(timeout.count())); }
    int readExact(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return QpmUart_ReadExact(&uart_, data, size, static_cast<int>(timeout.count())); }
    std::string readLine(std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}, std::size_t maxSize = 4096)
    {
        std::vector<char> buffer(maxSize + 1, '\0');
        const int count = QpmUart_ReadLine(&uart_, buffer.data(), buffer.size(), static_cast<int>(timeout.count()));
        return count > 0 ? std::string(buffer.data(), static_cast<std::size_t>(count)) : std::string{};
    }
    int bytesAvailable() { return QpmUart_BytesAvailable(&uart_); }
    bool purge(bool rx = true, bool tx = true) { return QpmUart_Purge(&uart_, rx ? 1 : 0, tx ? 1 : 0) == 0; }
    bool flush() { return QpmUart_Flush(&uart_) == 0; }
    bool setDtr(bool enabled) { return QpmUart_SetDtr(&uart_, enabled ? 1 : 0) == 0; }
    bool setRts(bool enabled) { return QpmUart_SetRts(&uart_, enabled ? 1 : 0) == 0; }
    QpmUart* native() { return &uart_; }
    const QpmUart* native() const { return &uart_; }

private:
    QpmUart uart_{};
};
}
