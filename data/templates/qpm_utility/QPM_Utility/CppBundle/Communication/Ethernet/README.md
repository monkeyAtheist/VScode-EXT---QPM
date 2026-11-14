# QPM C++ Ethernet bundle

C++17 RAII classes:
- `qpm::TcpClient`
- `qpm::TcpServer`
- `qpm::UdpSocket`

The bundle includes the maintained C socket backend. Windows projects need `ws2_32` (QPM adds it automatically when creating the bundle).
