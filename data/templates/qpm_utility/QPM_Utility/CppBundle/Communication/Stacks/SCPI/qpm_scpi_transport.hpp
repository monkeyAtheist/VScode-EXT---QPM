#pragma once
#include "qpm_scpi_transport.h"
#include <chrono>
#include <string>
namespace qpm { class ScpiTcpSession { QpmScpiTcpTransport t_{}; QpmScpi s_{}; public: ScpiTcpSession(){QpmScpiTcp_Init(&t_);} ~ScpiTcpSession(){QpmScpiTcp_Close(&t_);} bool connect(const std::string&h,uint16_t p=5025,std::chrono::milliseconds ms=std::chrono::seconds(3)){if(QpmScpiTcp_Connect(&t_,h.c_str(),p,(int)ms.count())!=0)return false;QpmScpi_BindTcp(&s_,&t_);return true;} QpmScpi*native(){return &s_;} }; }
