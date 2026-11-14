# QPM TLS bundle

TLS client transport backed by OpenSSL when `QPM_TLS_USE_OPENSSL` is defined and OpenSSL headers are available. Peer verification is enabled by default and hostname verification/SNI are configured automatically.

- Linux: define `QPM_TLS_USE_OPENSSL`, install the OpenSSL development package and link `-lssl -lcrypto`.
- MinGW/MSVC: define `QPM_TLS_USE_OPENSSL` and provide compatible OpenSSL headers/libraries.
- Without the opt-in macro (or without OpenSSL headers), the bundle remains dependency-free: it compiles as an explicit unavailable backend, `QpmTls_IsAvailable()` returns 0, and connect reports that TLS is unavailable.

This module deliberately keeps certificate verification enabled by default. Disabling verification is intended only for controlled diagnostic environments.
