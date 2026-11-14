#ifndef QPM_TLS_H
#define QPM_TLS_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmTlsConfig {
    int verifyPeer;
    const char *caFile;
    const char *caPath;
    const char *clientCertificateFile;
    const char *clientPrivateKeyFile;
    const char *serverName;
    int minimumTlsVersion; /* 12 or 13; 0 keeps backend default. */
} QpmTlsConfig;

typedef struct QpmTlsClient {
    void *context;
    void *session;
    void *bio;
    int connected;
} QpmTlsClient;

void QpmTls_DefaultConfig(QpmTlsConfig *config);
void QpmTls_Init(QpmTlsClient *client);
int QpmTls_IsAvailable(void);
const char *QpmTls_BackendName(void);
int QpmTls_Connect(QpmTlsClient *client, const char *host, uint16_t port, const QpmTlsConfig *config, int timeoutMs);
void QpmTls_Close(QpmTlsClient *client);
int QpmTls_Write(QpmTlsClient *client, const void *data, size_t size);
int QpmTls_Read(QpmTlsClient *client, void *data, size_t size, int timeoutMs);
int QpmTls_ReadExact(QpmTlsClient *client, void *data, size_t size, int timeoutMs);
int QpmTls_Query(QpmTlsClient *client, const void *txData, size_t txSize, void *rxData, size_t rxCapacity, int timeoutMs);
int QpmTls_PeerSubject(QpmTlsClient *client, char *buffer, size_t bufferSize);
int QpmTls_Cipher(QpmTlsClient *client, char *buffer, size_t bufferSize);
const char *QpmTls_LastErrorText(void);

#ifdef __cplusplus
}
#endif
#endif
