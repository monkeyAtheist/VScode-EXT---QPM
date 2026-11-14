#ifndef QPM_SCPI_TRANSPORT_H
#define QPM_SCPI_TRANSPORT_H
#include "qpm_scpi.h"
#include "qpm_socket.h"
#include "qpm_visa.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct QpmScpiTcpTransport { QpmSocketHandle socketHandle; } QpmScpiTcpTransport;
typedef struct QpmScpiVisaTransport { QpmVisaSession *session; } QpmScpiVisaTransport;
void QpmScpiTcp_Init(QpmScpiTcpTransport *transport);
int QpmScpiTcp_Connect(QpmScpiTcpTransport *transport,const char *host,uint16_t port,int timeoutMs);
void QpmScpiTcp_Close(QpmScpiTcpTransport *transport);
void QpmScpi_BindTcp(QpmScpi *scpi,QpmScpiTcpTransport *transport);
void QpmScpi_BindVisa(QpmScpi *scpi,QpmScpiVisaTransport *transport,QpmVisaSession *session);
#ifdef __cplusplus
}
#endif
#endif
