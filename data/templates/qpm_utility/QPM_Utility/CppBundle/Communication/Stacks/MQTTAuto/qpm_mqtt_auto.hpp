#pragma once
#include "qpm_mqtt_auto.h"
#include <string>
namespace qpm { class AutoMqttClient { QpmMqttAuto c_{}; public: AutoMqttClient(){QpmMqttAuto_Init(&c_);} ~AutoMqttClient(){QpmMqttAuto_Disconnect(&c_);} bool configure(const std::string&h,uint16_t p,const std::string&id,const std::string&u={},const std::string&pw={},int timeoutMs=3000){return QpmMqttAuto_Configure(&c_,h.c_str(),p,id.c_str(),u.empty()?nullptr:u.c_str(),pw.empty()?nullptr:pw.c_str(),timeoutMs)==0;} void subscribe(const std::string&t,int qos=0){QpmMqttAuto_AddSubscription(&c_,t.c_str(),qos);} bool connect(){return QpmMqttAuto_Connect(&c_)==0;} bool publish(const std::string&t,const std::string&p,int qos=0,bool retained=false){return QpmMqttAuto_Publish(&c_,t.c_str(),p.data(),p.size(),qos,retained?1:0)==0;} }; }
