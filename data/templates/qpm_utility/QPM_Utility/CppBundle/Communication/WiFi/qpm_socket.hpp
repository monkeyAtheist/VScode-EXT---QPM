#pragma once

#include "qpm_socket.h"
#include <chrono>
#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace qpm
{
namespace detail
{
class SocketRuntime
{
public:
    SocketRuntime() : ok_(QpmSocket_Startup() == 0) {}
    ~SocketRuntime() { if (ok_) QpmSocket_Cleanup(); }
    bool ok() const { return ok_; }
private:
    bool ok_{};
};
inline SocketRuntime& socketRuntime() { static SocketRuntime runtime; return runtime; }
}

class TcpClient
{
public:
    TcpClient() { (void)detail::socketRuntime(); }
    ~TcpClient() { close(); }
    TcpClient(const TcpClient&) = delete;
    TcpClient& operator=(const TcpClient&) = delete;
    TcpClient(TcpClient&& other) noexcept : handle_(std::exchange(other.handle_, QPM_SOCKET_INVALID)) {}
    TcpClient& operator=(TcpClient&& other) noexcept
    { if (this != &other) { close(); handle_ = std::exchange(other.handle_, QPM_SOCKET_INVALID); } return *this; }

    bool connect(const std::string& host, std::uint16_t port, std::chrono::milliseconds timeout = std::chrono::milliseconds{3000})
    { close(); handle_ = QpmSocket_TcpConnect(host.c_str(), port, static_cast<int>(timeout.count())); return valid(); }
    void close() { if (valid()) QpmSocket_Close(std::exchange(handle_, QPM_SOCKET_INVALID)); }
    bool valid() const { return handle_ != QPM_SOCKET_INVALID; }
    int send(const void* data, std::size_t size) { return QpmSocket_SendAll(handle_, data, size); }
    int send(std::string_view text) { return send(text.data(), text.size()); }
    int receive(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return QpmSocket_Receive(handle_, data, size, static_cast<int>(timeout.count())); }
    int receiveExact(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return QpmSocket_ReceiveExact(handle_, data, size, static_cast<int>(timeout.count())); }
    std::string receiveLine(std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}, std::size_t maxSize = 4096)
    {
        std::vector<char> buffer(maxSize + 1, '\0');
        const int count = QpmSocket_ReceiveLine(handle_, buffer.data(), buffer.size(), static_cast<int>(timeout.count()));
        return count > 0 ? std::string(buffer.data(), static_cast<std::size_t>(count)) : std::string{};
    }
    bool setNoDelay(bool enabled) { return QpmSocket_SetNoDelay(handle_, enabled ? 1 : 0) == 0; }
    bool setKeepAlive(bool enabled) { return QpmSocket_SetKeepAlive(handle_, enabled ? 1 : 0) == 0; }
    QpmSocketEndpoint localEndpoint() const { QpmSocketEndpoint ep{}; (void)QpmSocket_GetLocalEndpoint(handle_, &ep); return ep; }
    QpmSocketEndpoint peerEndpoint() const { QpmSocketEndpoint ep{}; (void)QpmSocket_GetPeerEndpoint(handle_, &ep); return ep; }
    QpmSocketHandle native() const { return handle_; }

private:
    explicit TcpClient(QpmSocketHandle handle) : handle_(handle) { (void)detail::socketRuntime(); }
    friend class TcpServer;
    QpmSocketHandle handle_{QPM_SOCKET_INVALID};
};

class TcpServer
{
public:
    TcpServer() { (void)detail::socketRuntime(); }
    ~TcpServer() { close(); }
    TcpServer(const TcpServer&) = delete;
    TcpServer& operator=(const TcpServer&) = delete;
    TcpServer(TcpServer&& other) noexcept : handle_(std::exchange(other.handle_, QPM_SOCKET_INVALID)) {}
    TcpServer& operator=(TcpServer&& other) noexcept
    { if (this != &other) { close(); handle_ = std::exchange(other.handle_, QPM_SOCKET_INVALID); } return *this; }
    bool listen(const std::string& address, std::uint16_t port, int backlog = 8)
    { close(); handle_ = QpmSocket_TcpListen(address.empty() ? nullptr : address.c_str(), port, backlog); return valid(); }
    std::pair<TcpClient, QpmSocketEndpoint> accept(std::chrono::milliseconds timeout = std::chrono::milliseconds{-1})
    {
        QpmSocketEndpoint ep{};
        auto client = QpmSocket_TcpAcceptTimeout(handle_, static_cast<int>(timeout.count()), &ep);
        return { TcpClient(client), ep };
    }
    void close() { if (valid()) QpmSocket_Close(std::exchange(handle_, QPM_SOCKET_INVALID)); }
    bool valid() const { return handle_ != QPM_SOCKET_INVALID; }
    QpmSocketEndpoint localEndpoint() const { QpmSocketEndpoint ep{}; (void)QpmSocket_GetLocalEndpoint(handle_, &ep); return ep; }
private:
    QpmSocketHandle handle_{QPM_SOCKET_INVALID};
};

class UdpSocket
{
public:
    UdpSocket() { (void)detail::socketRuntime(); }
    ~UdpSocket() { close(); }
    UdpSocket(const UdpSocket&) = delete;
    UdpSocket& operator=(const UdpSocket&) = delete;
    UdpSocket(UdpSocket&& other) noexcept : handle_(std::exchange(other.handle_, QPM_SOCKET_INVALID)) {}
    UdpSocket& operator=(UdpSocket&& other) noexcept
    { if (this != &other) { close(); handle_ = std::exchange(other.handle_, QPM_SOCKET_INVALID); } return *this; }
    bool open(const std::string& bindAddress = {}, std::uint16_t localPort = 0, bool broadcast = false)
    { close(); handle_ = QpmSocket_UdpOpen(bindAddress.empty() ? nullptr : bindAddress.c_str(), localPort, broadcast ? 1 : 0); return valid(); }
    bool connect(const std::string& host, std::uint16_t port) { return QpmSocket_UdpConnect(handle_, host.c_str(), port) == 0; }
    int send(const void* data, std::size_t size) { return QpmSocket_UdpSend(handle_, data, size); }
    int sendTo(const std::string& host, std::uint16_t port, const void* data, std::size_t size) { return QpmSocket_UdpSendTo(handle_, host.c_str(), port, data, size); }
    int receive(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}) { return QpmSocket_UdpReceive(handle_, data, size, static_cast<int>(timeout.count())); }
    int receiveFrom(void* data, std::size_t size, QpmSocketEndpoint& peer, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return QpmSocket_UdpReceiveFrom(handle_, data, size, static_cast<int>(timeout.count()), peer.address, sizeof(peer.address), &peer.port); }
    bool joinMulticast(const std::string& group, const std::string& interfaceAddress = {}) { return QpmSocket_UdpJoinMulticast(handle_, group.c_str(), interfaceAddress.empty() ? nullptr : interfaceAddress.c_str()) == 0; }
    bool leaveMulticast(const std::string& group, const std::string& interfaceAddress = {}) { return QpmSocket_UdpLeaveMulticast(handle_, group.c_str(), interfaceAddress.empty() ? nullptr : interfaceAddress.c_str()) == 0; }
    void close() { if (valid()) QpmSocket_Close(std::exchange(handle_, QPM_SOCKET_INVALID)); }
    bool valid() const { return handle_ != QPM_SOCKET_INVALID; }
    QpmSocketEndpoint localEndpoint() const { QpmSocketEndpoint ep{}; (void)QpmSocket_GetLocalEndpoint(handle_, &ep); return ep; }
private:
    QpmSocketHandle handle_{QPM_SOCKET_INVALID};
};
}
