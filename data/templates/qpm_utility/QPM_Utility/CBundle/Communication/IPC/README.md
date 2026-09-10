# QPM C IPC communication

Cross-platform C local IPC wrapper.

## Files

- `qpm_ipc.c`
- `qpm_ipc.h`

## Main API

- server creation/opening
- client connection
- read/write helpers
- cleanup helpers

Windows uses named pipes. POSIX/Linux uses FIFO-style paths where applicable.
