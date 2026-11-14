#pragma once
#include "qpm_tls.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>
namespace qpm { class TlsClient { QpmTlsClient c_{}; public: TlsClient(){QpmTls_Init(&c_);} ~TlsClient(){QpmTls_Close(&c_);} TlsClient(const TlsClient&)=delete; TlsClient&operator=(const TlsClient&)=delete; bool connect(const std::string&host,std::uint16_t port,const QpmTlsConfig&cfg,std::chrono::milliseconds t=std::chrono::seconds(5)){return QpmTls_Connect(&c_,host.c_str(),port,&cfg,(int)t.count())==0;} void close(){QpmTls_Close(&c_);} int write(const void*d,std::size_t n){return QpmTls_Write(&c_,d,n);} std::vector<std::uint8_t> read(std::size_t max,std::chrono::milliseconds t=std::chrono::seconds(1)){std::vector<std::uint8_t>b(max);int n=QpmTls_Read(&c_,b.data(),b.size(),(int)t.count());if(n<0)throw std::runtime_error(QpmTls_LastErrorText());b.resize((std::size_t)n);return b;} static bool available(){return QpmTls_IsAvailable()!=0;} }; }
