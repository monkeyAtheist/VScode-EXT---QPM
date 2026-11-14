#pragma once
#include "qpm_log.h"
#include <cstddef>
#include <string>
#include <vector>
namespace qpm {
enum class LogLevel { Trace=QPM_LOG_TRACE, Debug=QPM_LOG_DEBUG, Info=QPM_LOG_INFO, Warn=QPM_LOG_WARN, Error=QPM_LOG_ERROR, Fatal=QPM_LOG_FATAL, Off=QPM_LOG_OFF };
class Logger { public: Logger(){QpmLog_Init();} ~Logger(){QpmLog_Shutdown();} Logger(const Logger&)=delete;Logger&operator=(const Logger&)=delete; void setLevel(LogLevel l){QpmLog_SetLevel(static_cast<QpmLogLevel>(l));} void enableConsole(bool e){QpmLog_EnableConsole(e?1:0);} bool setFile(const std::string&p,bool append=true){return QpmLog_SetFile(p.c_str(),append?1:0)==0;} void closeFile(){QpmLog_CloseFile();} template<class...A> void write(LogLevel l,const char*fmt,A...a){QpmLog_Write(static_cast<QpmLogLevel>(l),fmt,a...);} void hex(LogLevel l,const std::string&label,const void*data,size_t n,size_t width=16){QpmLog_Hex(static_cast<QpmLogLevel>(l),label.c_str(),data,n,width);} };
}
