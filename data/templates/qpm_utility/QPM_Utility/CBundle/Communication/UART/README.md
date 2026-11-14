# QPM UART bundle

Cross-platform C serial-port wrapper for Windows and POSIX.

Highlights:
- configuration structure for baud rate, 5/6/7/8 data bits, parity, 1/2 stop bits and flow control;
- DTR/RTS control, break generation, purge and flush;
- byte count query;
- write-all, read-exact, read-until and line helpers;
- legacy `QpmUart_Open()` kept for compatibility.

```c
QpmUart uart;
QpmUartConfig cfg;
QpmUart_Init(&uart);
QpmUart_DefaultConfig(&cfg);
cfg.baudRate = 115200;
cfg.parity = QPM_UART_PARITY_NONE;
cfg.flowControl = QPM_UART_FLOW_NONE;

if (QpmUart_OpenConfig(&uart, "COM4", &cfg) == 0) {
    QpmUart_WriteText(&uart, "*IDN?\\r\\n");
    char line[256];
    if (QpmUart_ReadLine(&uart, line, sizeof(line), 1000) > 0) {
        /* use line */
    }
    QpmUart_Close(&uart);
}
```

On Linux, use device paths such as `/dev/ttyUSB0` or `/dev/ttyACM0`.
