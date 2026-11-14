# QPM maintained C++ communication stack

The C++ stack wraps the maintained C transport/protocol backends instead of carrying a second implementation. Wrappers are C++17-compatible, move-aware and use RAII for transport lifetime.

Available wrappers include:
- `qpm::SerialPort`
- `qpm::Rs485Bus`
- `qpm::LinMaster`
- `qpm::TcpClient`, `qpm::TcpServer`, `qpm::UdpSocket`
- `qpm::IpcChannel`
- `qpm::BluetoothRfcomm`
- `qpm::HidDevice`
- `qpm::CanBus`
- `qpm::I2cDevice`
- `qpm::SpiDevice`
- `qpm::VisaRuntime`, `qpm::VisaSession`
- `qpm::ScpiClient`
- `qpm::MqttClient`
- `qpm::HttpClient`
- `qpm::WebSocket`
- `qpm::retry`
- framing and Modbus helpers

The HTTP/MQTT/WebSocket modules are deliberately plain TCP (`http://`, MQTT 1883, `ws://`) unless the application supplies a real TLS layer.

## 0.2.103 additions

- TLS client transport (OpenSSL-backed; certificate and hostname verification enabled by default)
- Generic USB via dynamically-loaded libusb-1.0
- Native Windows BLE GATT service/characteristic access
- Ready-to-use stacks: SCPI over TCP/VISA, Modbus RTU over RS-485, MQTT automatic reconnect/resubscription
