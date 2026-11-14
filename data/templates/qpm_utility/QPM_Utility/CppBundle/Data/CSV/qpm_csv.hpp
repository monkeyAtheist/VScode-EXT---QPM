#pragma once
#include "qpm_csv.h"
#include <cstdio>
#include <functional>
#include <stdexcept>
#include <string>
#include <vector>
namespace qpm {
using CsvRow=std::vector<std::string>;
inline CsvRow parseCsvLine(const std::string&line,char delimiter=','){QpmCsvRow r{};if(QpmCsv_ParseLine(line.c_str(),delimiter,&r)!=0)throw std::runtime_error("CSV parse failed");CsvRow out;out.reserve(r.count);for(size_t i=0;i<r.count;++i)out.emplace_back(r.fields[i]?r.fields[i]:"");QpmCsv_FreeRow(&r);return out;}
inline bool appendCsvRow(const std::string&path,const CsvRow&row,char delimiter=','){std::vector<const char*>p;for(auto&s:row)p.push_back(s.c_str());return QpmCsv_AppendRow(path.c_str(),p.data(),p.size(),delimiter)==0;}
inline std::vector<CsvRow> readCsv(const std::string&path,char delimiter=','){struct Ctx{std::vector<CsvRow> rows;};Ctx c;auto cb=[](const QpmCsvRow*r,size_t,void*u)->int{auto*c=static_cast<Ctx*>(u);CsvRow row;row.reserve(r->count);for(size_t i=0;i<r->count;++i)row.emplace_back(r->fields[i]?r->fields[i]:"");c->rows.push_back(std::move(row));return 0;};if(QpmCsv_ReadFile(path.c_str(),delimiter,cb,&c)!=0)throw std::runtime_error("CSV read failed");return c.rows;}
}
