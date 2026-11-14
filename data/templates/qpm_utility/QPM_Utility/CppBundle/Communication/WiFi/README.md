# QPM C++ Wi-Fi bundle

Wi-Fi communication at application level uses the same TCP/UDP stack as Ethernet once Windows/Linux has associated with an access point.

The bundle exposes `qpm::WifiTcpClient`, `qpm::WifiTcpServer` and `qpm::WifiUdpSocket`. Access-point discovery/association stays with the operating system.
