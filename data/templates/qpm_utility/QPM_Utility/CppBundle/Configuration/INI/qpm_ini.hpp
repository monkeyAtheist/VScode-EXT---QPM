#pragma once
#include "qpm_ini.h"
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace qpm {
class IniDocument {
public:
    IniDocument() { QpmIni_Init(&doc_); }
    ~IniDocument() { QpmIni_Free(&doc_); }
    IniDocument(const IniDocument&) = delete;
    IniDocument& operator=(const IniDocument&) = delete;
    IniDocument(IniDocument&& other) noexcept : doc_(other.doc_) { QpmIni_Init(&other.doc_); }
    IniDocument& operator=(IniDocument&& other) noexcept {
        if (this != &other) { QpmIni_Free(&doc_); doc_ = other.doc_; QpmIni_Init(&other.doc_); }
        return *this;
    }
    void setCaseSensitive(bool enabled) { QpmIni_SetCaseSensitive(&doc_, enabled ? 1 : 0); }
    int load(const std::string& path) { return QpmIni_Load(&doc_, path.c_str()); }
    int save(const std::string& path) const { return QpmIni_Save(&doc_, path.c_str()); }
    bool hasSection(const std::string& section) const { return QpmIni_HasSection(&doc_, section.c_str()) != 0; }
    bool hasKey(const std::string& section, const std::string& key) const { return QpmIni_HasKey(&doc_, section.c_str(), key.c_str()) != 0; }
    std::string getString(const std::string& section, const std::string& key, const std::string& fallback = {}) const {
        const char* raw = QpmIni_GetRawValue(&doc_, section.c_str(), key.c_str());
        return raw ? std::string(raw) : fallback;
    }
    int getInt(const std::string& section, const std::string& key, int fallback = 0) const {
        int value=fallback; (void)QpmIni_GetInt(&doc_, section.c_str(), key.c_str(), fallback, &value); return value;
    }
    std::int64_t getInt64(const std::string& section, const std::string& key, std::int64_t fallback = 0) const {
        int64_t value=fallback; (void)QpmIni_GetInt64(&doc_, section.c_str(), key.c_str(), fallback, &value); return value;
    }
    double getDouble(const std::string& section, const std::string& key, double fallback = 0.0) const {
        double value=fallback; (void)QpmIni_GetDouble(&doc_, section.c_str(), key.c_str(), fallback, &value); return value;
    }
    bool getBool(const std::string& section, const std::string& key, bool fallback = false) const {
        int value=fallback?1:0; (void)QpmIni_GetBool(&doc_, section.c_str(), key.c_str(), fallback?1:0, &value); return value != 0;
    }
    int set(const std::string& section, const std::string& key, const std::string& value) { return QpmIni_SetString(&doc_, section.c_str(), key.c_str(), value.c_str()); }
    int set(const std::string& section, const std::string& key, int value) { return QpmIni_SetInt(&doc_, section.c_str(), key.c_str(), value); }
    int set(const std::string& section, const std::string& key, std::int64_t value) { return QpmIni_SetInt64(&doc_, section.c_str(), key.c_str(), value); }
    int set(const std::string& section, const std::string& key, double value) { return QpmIni_SetDouble(&doc_, section.c_str(), key.c_str(), value); }
    int set(const std::string& section, const std::string& key, bool value) { return QpmIni_SetBool(&doc_, section.c_str(), key.c_str(), value?1:0); }
    int removeKey(const std::string& section, const std::string& key) { return QpmIni_RemoveKey(&doc_, section.c_str(), key.c_str()); }
    int removeSection(const std::string& section) { return QpmIni_RemoveSection(&doc_, section.c_str()); }
    std::vector<std::string> sections() const {
        std::vector<std::string> out; const auto n=QpmIni_GetSectionCount(&doc_); out.reserve(n);
        for(size_t i=0;i<n;++i){ const char* s=QpmIni_GetSectionName(&doc_,i); if(s) out.emplace_back(s); } return out;
    }
    std::vector<std::string> keys(const std::string& section) const {
        std::vector<std::string> out; const auto n=QpmIni_GetKeyCount(&doc_, section.c_str()); out.reserve(n);
        for(size_t i=0;i<n;++i){ const char* s=QpmIni_GetKeyName(&doc_,section.c_str(),i); if(s) out.emplace_back(s); } return out;
    }
    QpmIniDocument* nativeHandle() noexcept { return &doc_; }
    const QpmIniDocument* nativeHandle() const noexcept { return &doc_; }
private: QpmIniDocument doc_{};
};
inline const char* iniStatusString(int status) { return QpmIni_StatusString(status); }
}
