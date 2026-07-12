"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IniDocument = exports.IniSection = void 0;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
class IniSection {
    name;
    lines;
    constructor(name, lines = []) {
        this.name = name;
        this.lines = lines;
    }
    get(key) {
        const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.*)$`, 'i');
        for (const line of this.lines) {
            const match = line.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return undefined;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    set(key, value) {
        const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, 'i');
        const index = this.lines.findIndex((line) => pattern.test(line));
        const rendered = `${key} = ${value}`;
        if (index >= 0) {
            this.lines[index] = rendered;
            return;
        }
        let insertionIndex = this.lines.length;
        while (insertionIndex > 0 && this.lines[insertionIndex - 1].trim() === '') {
            insertionIndex -= 1;
        }
        this.lines.splice(insertionIndex, 0, rendered);
    }
    delete(key) {
        const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, 'i');
        this.lines = this.lines.filter((line) => !pattern.test(line));
    }
    deleteMatching(pattern) {
        this.lines = this.lines.filter((line) => !pattern.test(line));
    }
    entries() {
        const result = [];
        for (const line of this.lines) {
            const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)$/);
            if (match) {
                result.push({ key: match[1].trim(), value: match[2].trim() });
            }
        }
        return result;
    }
}
exports.IniSection = IniSection;
class IniDocument {
    sections = [];
    preamble = [];
    static parse(text) {
        const document = new IniDocument();
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
        let current;
        for (const line of lines) {
            const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
            if (sectionMatch) {
                current = new IniSection(sectionMatch[1].trim(), []);
                document.sections.push(current);
            }
            else if (current) {
                current.lines.push(line);
            }
            else {
                document.preamble.push(line);
            }
        }
        return document;
    }
    getSection(name) {
        return this.sections.find((section) => section.name.toLowerCase() === name.toLowerCase());
    }
    ensureSection(name, beforeSectionName) {
        const existing = this.getSection(name);
        if (existing) {
            return existing;
        }
        const section = new IniSection(name, ['']);
        if (!beforeSectionName) {
            this.sections.push(section);
            return section;
        }
        const index = this.sections.findIndex((candidate) => candidate.name.toLowerCase() === beforeSectionName.toLowerCase());
        if (index >= 0) {
            this.sections.splice(index, 0, section);
        }
        else {
            this.sections.push(section);
        }
        return section;
    }
    addSection(section, beforeSectionName) {
        if (!beforeSectionName) {
            this.sections.push(section);
            return;
        }
        const index = this.sections.findIndex((candidate) => candidate.name.toLowerCase() === beforeSectionName.toLowerCase());
        if (index >= 0) {
            this.sections.splice(index, 0, section);
        }
        else {
            this.sections.push(section);
        }
    }
    removeSection(name) {
        const index = this.sections.findIndex((section) => section.name.toLowerCase() === name.toLowerCase());
        if (index >= 0) {
            this.sections.splice(index, 1);
        }
    }
    toString() {
        const chunks = [];
        if (this.preamble.some((line) => line.trim() !== '')) {
            chunks.push(this.preamble.join('\r\n'));
        }
        for (const section of this.sections) {
            const body = section.lines.join('\r\n').replace(/(?:\r\n)*$/, '');
            chunks.push(`[${section.name}]${body ? `\r\n${body}` : ''}`);
        }
        return `${chunks.join('\r\n\r\n')}\r\n`;
    }
}
exports.IniDocument = IniDocument;
