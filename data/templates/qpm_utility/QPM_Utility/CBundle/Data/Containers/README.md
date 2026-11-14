# QPM C Containers bundle

Two dependency-free generic containers:

- `QpmVector`: growable array of fixed-size elements.
- `QpmRingBuffer`: fixed-capacity FIFO with optional overwrite-oldest behavior.

Elements are copied by value with `memcpy`; ownership of pointers stored inside an element remains the caller's responsibility.
