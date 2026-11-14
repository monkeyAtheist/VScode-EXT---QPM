#include "qpm_scpi_transport.h"
static int tcp_write(void*c,const void*d,size_t n){QpmScpiTcpTransport*t=(QpmScpiTcpTransport*)c;return QpmSocket_SendAll(t->socketHandle,d,n);}
static int tcp_read(void*c,void*d,size_t n,int ms){QpmScpiTcpTransport*t=(QpmScpiTcpTransport*)c;return QpmSocket_Receive(t->socketHandle,d,n,ms);}
static int visa_write(void*c,const void*d,size_t n){QpmScpiVisaTransport*t=(QpmScpiVisaTransport*)c;return QpmVisa_Write(t->session,d,n);}
static int visa_read(void*c,void*d,size_t n,int ms){QpmScpiVisaTransport*t=(QpmScpiVisaTransport*)c;return QpmVisa_Read(t->session,d,n,ms);}
void QpmScpiTcp_Init(QpmScpiTcpTransport*t){if(t)t->socketHandle=QPM_SOCKET_INVALID;}int QpmScpiTcp_Connect(QpmScpiTcpTransport*t,const char*h,uint16_t p,int ms){if(!t||!h)return -1;QpmScpiTcp_Close(t);if(QpmSocket_Startup()!=0)return -2;t->socketHandle=QpmSocket_TcpConnect(h,p?p:5025,ms);if(t->socketHandle==QPM_SOCKET_INVALID){QpmSocket_Cleanup();return -3;}return 0;}void QpmScpiTcp_Close(QpmScpiTcpTransport*t){if(t&&t->socketHandle!=QPM_SOCKET_INVALID){QpmSocket_Close(t->socketHandle);QpmSocket_Cleanup();t->socketHandle=QPM_SOCKET_INVALID;}}
void QpmScpi_BindTcp(QpmScpi*s,QpmScpiTcpTransport*t){QpmScpi_Init(s,t,tcp_write,tcp_read);}void QpmScpi_BindVisa(QpmScpi*s,QpmScpiVisaTransport*t,QpmVisaSession*v){if(t)t->session=v;QpmScpi_Init(s,t,visa_write,visa_read);}
