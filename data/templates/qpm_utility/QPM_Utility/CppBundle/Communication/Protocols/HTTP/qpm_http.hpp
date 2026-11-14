#pragma once
#include "qpm_http.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

namespace qpm {
struct HttpResult { QpmHttpResponse response{}; std::vector<std::uint8_t> body; };
class HttpClient {
public:
    static HttpResult request(const std::string& method, const std::string& url, const std::string& headers = {}, const std::vector<std::uint8_t>& body = {}, std::size_t maxResponse = 1024 * 1024, std::chrono::milliseconds timeout = std::chrono::seconds(5)) {
        HttpResult r; r.body.resize(maxResponse); int rc = QpmHttp_Request(method.c_str(), url.c_str(), headers.empty() ? nullptr : headers.c_str(), body.empty() ? nullptr : body.data(), body.size(), r.body.data(), r.body.size(), &r.response, static_cast<int>(timeout.count())); if (rc < 0) throw std::runtime_error(QpmHttp_ResultText(rc)); r.body.resize(r.response.bodySize); return r;
    }
    static HttpResult get(const std::string& url, std::size_t maxResponse = 1024 * 1024, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { return request("GET", url, {}, {}, maxResponse, timeout); }
};
}
