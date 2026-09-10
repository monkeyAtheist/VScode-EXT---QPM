# QPM C UART communication

Cross-platform C serial-port wrapper.

## Files

- `qpm_uart.c`
- `qpm_uart.h`

## Main API

- `QpmUart_Open(...)`
- `QpmUart_Read(...)`
- `QpmUart_Write(...)`
- `QpmUart_ReadLine(...)`
- `QpmUart_Close(...)`

On Windows, port names such as `COM10` and above may require the `\\.\COM10` form.
