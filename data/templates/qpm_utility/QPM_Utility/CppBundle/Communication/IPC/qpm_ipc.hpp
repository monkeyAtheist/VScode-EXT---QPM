#pragma once
#include "qpm_ipc.h"
#include <chrono>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace qpm
{
class IpcChannel
{
public:
    IpcChannel() { QpmIpc_Init(&pipe_); }
    ~IpcChannel() { QpmIpc_Close(&pipe_); }
    IpcChannel(const IpcChannel&) = delete;
    IpcChannel& operator=(const IpcChannel&) = delete;
    IpcChannel(IpcChannel&& other) noexcept : pipe_(other.pipe_) { QpmIpc_Init(&other.pipe_); }
    IpcChannel& operator=(IpcChannel&& other) noexcept { if (this != &other) { QpmIpc_Close(&pipe_); pipe_ = other.pipe_; QpmIpc_Init(&other.pipe_); } return *this; }
    bool createServer(const std::string& name) { return QpmIpc_CreateServer(&pipe_, name.c_str()) == 0; }
    bool waitClient(std::chrono::milliseconds timeout = std::chrono::milliseconds{-1}) { return QpmIpc_WaitClient(&pipe_, static_cast<int>(timeout.count())) == 0; }
    bool disconnectClient() { return QpmIpc_DisconnectClient(&pipe_) == 0; }
    bool connect(const std::string& name, std::chrono::milliseconds timeout = std::chrono::milliseconds{3000}) { return QpmIpc_Connect(&pipe_, name.c_str(), static_cast<int>(timeout.count())) == 0; }
    int send(const void* data, std::size_t size) { return QpmIpc_SendAll(&pipe_, data, size); }
    int receive(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}) { return QpmIpc_Receive(&pipe_, data, size, static_cast<int>(timeout.count())); }
    bool sendMessage(const void* data, std::uint32_t size) { return QpmIpc_SendMessage(&pipe_, data, size) >= 0; }
    std::vector<std::uint8_t> receiveMessage(std::size_t maxSize = 1024 * 1024, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    {
        std::vector<std::uint8_t> result(maxSize); std::uint32_t size = 0;
        const int rc = QpmIpc_ReceiveMessage(&pipe_, result.data(), result.size(), &size, static_cast<int>(timeout.count()));
        if (rc < 0) return {};
        result.resize(size);
        return result;
    }
    bool isOpen() const { return QpmIpc_IsOpen(&pipe_) != 0; }
    void close() { QpmIpc_Close(&pipe_); }
private:
    QpmIpcPipe pipe_{};
};
}
