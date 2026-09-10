# QPM C Ethernet TCP/UDP communication

Cross-platform C socket wrapper for TCP client/server and UDP helpers.

## Files

- `qpm_socket.c`
- `qpm_socket.h`

## Windows link dependency

On Windows, this module requires `ws2_32`. QPM automatically adds `ws2_32` to the workspace linker libraries when this bundle is added.
