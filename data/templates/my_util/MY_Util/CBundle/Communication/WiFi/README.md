# QPM C Wi-Fi communication bundle

This module intentionally handles the **application IP layer** only. Once the operating system is connected to a Wi-Fi network, an application normally uses the same TCP/UDP socket APIs as Ethernet.

Included API:

- `QpmWifi_OpenTcpClient`
- `QpmWifi_OpenTcpServer`
- `QpmWifi_AcceptClient`
- `QpmWifi_OpenUdp`
- `QpmWifi_Send` / `QpmWifi_Receive`
- `QpmWifi_SendTo` / `QpmWifi_ReceiveFrom`

The module does not join Wi-Fi networks, manage SSIDs, or scan adapters. Those operations are platform-specific system administration tasks.

Windows link dependency: `ws2_32`.
