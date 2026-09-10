/**
 * @file errorManagement.cpp
 * @brief Implementation of the errorManagement C++ bundle.
 *
 * Generated bundle implementation. Public API semantics are documented in the matching header file.
 */
#include "errorManagement.h"

jc_error::error jc_error::erreur;

void jc_error::error::printErrorLog()
{
    qpm_utility::append_error_log(this->path, this->code, this->message);
}

void jc_error::error::report(int errorCode, const std::string& errorMessage, const char* file, int line, const char* functionName)
{
    this->code = errorCode;
    this->message = errorMessage;
    this->errorStatus = true;
    qpm_utility::append_error_log(this->path, this->code, this->message, file, line, functionName);
}