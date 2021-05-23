// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as child_process from "child_process";
import * as fs from "fs";
import * as iconv from "iconv-lite";
import * as os from "os";
import * as path from "path";
import * as properties from "properties";
import * as vscode from "vscode";
import * as WinReg from "winreg";
import { arduinoChannel } from "./outputChannel";

const encodingMapping: object = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../misc", "codepageMapping.json"), "utf8"));

/**
 * This function will detect the file existing in the sync mode.
 * @function fileExistsSync
 * @argument {string} filePath
 */
export function fileExistsSync(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isFile();
    } catch (e) {
        return false;
    }
}

/**
 * This function will detect the directoy existing in the sync mode.
 * @function directoryExistsSync
 * @argument {string} dirPath
 */
export function directoryExistsSync(dirPath: string): boolean {
    try {
        return fs.statSync(dirPath).isDirectory();
    } catch (e) {
        return false;
    }
}

/**
 * This function will implement the same function as the fs.readdirSync,
 * besides it could filter out folders only when the second argument is true.
 * @function readdirSync
 * @argument {string} dirPath
 * @argument {boolean} folderOnly
 */
export function readdirSync(dirPath: string, folderOnly: boolean = false): string[] {
    const dirs = fs.readdirSync(dirPath);
    if (folderOnly) {
        return dirs.filter((subdir) => {
            return directoryExistsSync(path.join(dirPath, subdir));
        });
    } else {
        return dirs;
    }
}

/**
 * Recursively create directories. Equals to "mkdir -p"
 * @function mkdirRecursivelySync
 * @argument {string} dirPath
 */
export function mkdirRecursivelySync(dirPath: string): void {
    if (directoryExistsSync(dirPath)) {
        return;
    }
    const dirname = path.dirname(dirPath);
    if (path.normalize(dirname) === path.normalize(dirPath)) {
        fs.mkdirSync(dirPath);
    } else if (directoryExistsSync(dirname)) {
        fs.mkdirSync(dirPath);
    } else {
        mkdirRecursivelySync(dirname);
        fs.mkdirSync(dirPath);
    }
}

/**
 * Recursively delete files. Equals to "rm -rf"
 * @function rmdirRecursivelySync
 * @argument {string} rootPath
 */
export function rmdirRecursivelySync(rootPath: string): void {
    if (fs.existsSync(rootPath)) {
        fs.readdirSync(rootPath).forEach((file) => {
            const curPath = path.join(rootPath, file);
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                rmdirRecursivelySync(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(rootPath);
    }
}

function copyFileSync(src, dest, overwrite: boolean = true) {
    if (!fileExistsSync(src) || (!overwrite && fileExistsSync(dest))) {
        return;
    }
    const BUF_LENGTH = 64 * 1024;
    const buf = new Buffer(BUF_LENGTH);
    let lastBytes = BUF_LENGTH;
    let pos = 0;
    let srcFd = null;
    let destFd = null;

    try {
        srcFd = fs.openSync(src, "r");
    } catch (error) {
    }

    try {
        destFd = fs.openSync(dest, "w");
    } catch (error) {
    }

    try {
        while (lastBytes === BUF_LENGTH) {
            lastBytes = fs.readSync(srcFd, buf, 0, BUF_LENGTH, pos);
            fs.writeSync(destFd, buf, 0, lastBytes);
            pos += lastBytes;
        }
    } catch (error) {
    }

    if (srcFd) {
        fs.closeSync(srcFd);
    }
    if (destFd) {
        fs.closeSync(destFd);
    }
}

function copyFolderRecursivelySync(src, dest) {
    if (!directoryExistsSync(src)) {
        return;
    }
    if (!directoryExistsSync(dest)) {
        mkdirRecursivelySync(dest);
    }

    const items = fs.readdirSync(src);
    for (const item of items) {
        const fullPath = path.join(src, item);
        const targetPath = path.join(dest, item);
        if (directoryExistsSync(fullPath)) {
            copyFolderRecursivelySync(fullPath, targetPath);
        } else if (fileExistsSync(fullPath)) {
            copyFileSync(fullPath, targetPath);
        }
    }
}

/**
 * Copy files & directories recursively. Equals to "cp -r"
 * @argument {string} src
 * @argument {string} dest
 */
export function cp(src, dest) {
    if (fileExistsSync(src)) {
        let targetFile = dest;
        if (directoryExistsSync(dest)) {
            targetFile = path.join(dest, path.basename(src));
        }
        if (path.relative(src, targetFile)) {
            // if the source and target file is the same, skip copying.
            return;
        }
        copyFileSync(src, targetFile);
    } else if (directoryExistsSync(src)) {
        copyFolderRecursivelySync(src, dest);
    } else {
        throw new Error(`No such file or directory: ${src}`);
    }
}

/**
 * Check if the specified file is an arduino file (*.ino, *.pde).
 * @argument {string} filePath
 */
export function isArduinoFile(filePath): boolean {
    return fileExistsSync(filePath) && (path.extname(filePath) === ".ino" || path.extname(filePath) === ".pde");
}

/**
 * Send a command to arduino
 * @param {string} command - base command path (either Arduino IDE or CLI)
 * @param {vscode.OutputChannel} outputChannel - output display channel
 * @param {string[]} [args=[]] - arguments to pass to the command
 * @param {any} [options={}] - options and flags for the arguments
 * @param {(string) => {}} - callback for stdout text
 */
export function spawn(
    command: string,
    args: string[] = [],
    options: child_process.SpawnOptions = {},
    output?: {channel?: vscode.OutputChannel,
              stdout?: (s: string) => void,
              stderr?: (s: string) => void},
): Thenable<object> {
    return new Promise((resolve, reject) => {
        options.cwd = options.cwd || path.resolve(path.join(__dirname, ".."));
        const child = child_process.spawn(command, args, options);

        let codepage = "65001";
        if (os.platform() === "win32") {
            codepage = getArduinoL4jCodepage(command.replace(/.exe$/i, ".l4j.ini"));
            if (!codepage) {
                try {
                    const chcp = child_process.execSync("chcp.com");
                    codepage = chcp.toString().split(":").pop().trim();
                } catch (error) {
                    arduinoChannel.warning(`Defaulting to code page 850 because chcp.com failed.\
                    \rEnsure your path includes %SystemRoot%\\system32\r${error.message}`);
                    codepage = "850";
                }
            }
        }

        if (output) {
            if (output.channel || output.stdout) {
                child.stdout.on("data", (data: Buffer) => {
                    const decoded = decodeData(data, codepage);
                    if (output.stdout) {
                        output.stdout(decoded);
                    }
                    if (output.channel) {
                        output.channel.append(decoded);
                    }
                });
            }
            if (output.channel || output.stderr) {
                child.stderr.on("data", (data: Buffer) => {
                    const decoded = decodeData(data, codepage);
                    if (output.stderr) {
                        output.stderr(decoded);
                    }
                    if (output.channel) {
                        output.channel.append(decoded);
                    }
                });
            }
        }

        child.on("error", (error) => reject({ error }));
        child.on("exit", (code) => {
            if (code === 0) {
                resolve({ code });
            } else {
                reject({ code });
            }
        });
    });
}

export function getArduinoL4jCodepage(filePath: string): string | undefined {
    const encoding = parseConfigFile(filePath).get("-Dfile.encoding");
    if(encoding === "UTF8") {
        return "65001";
    }
    return Object.keys(encodingMapping).reduce((r, key) => {
        return encodingMapping[key] === encoding ? key : r;
    }, undefined);
}

export function decodeData(data: Buffer, codepage: string): string {
    if (encodingMapping.hasOwnProperty(codepage)) {
        return iconv.decode(data, encodingMapping[codepage]);
    }
    return data.toString();
}

export function tryParseJSON(jsonString: string) {
    try {
        const jsonObj = JSON.parse(jsonString);
        if (jsonObj && typeof jsonObj === "object") {
            return jsonObj;
        }
    } catch (ex) { }

    return undefined;
}

export function isJunk(filename: string): boolean {
    // tslint:disable-next-line
    const re = /^npm-debug\.log$|^\..*\.swp$|^\.DS_Store$|^\.AppleDouble$|^\.LSOverride$|^Icon\r$|^\._.*|^\.Spotlight-V100(?:$|\/)|\.Trashes|^__MACOSX$|~$|^Thumbs\.db$|^ehthumbs\.db$|^Desktop\.ini$/;
    return re.test(filename);
}

export function filterJunk(files: any[]): any[] {
    return files.filter((file) => !isJunk(file));
}

export function parseProperties(propertiesFile: string): Thenable<object> {
    return new Promise((resolve, reject) => {
        properties.parse(propertiesFile, { path: true }, (error, obj) => {
            if (error) {
                reject(error);
            } else {
                resolve(obj);
            }
        });
    });
}

export function formatVersion(version: string): string {
    if (!version) {
        return version;
    }
    const versions = String(version).split(".");
    if (versions.length < 2) {
        versions.push("0");
    }
    if (versions.length < 3) {
        versions.push("0");
    }
    return versions.join(".");
}

export function trim(value: any) {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            value[i] = trim(value[i]);
        }
    } else if (typeof value === "string") {
        value = value.trim();
    }
    return value;
}

export function union(a: any[], b: any[], compare?: (item1, item2) => boolean) {
    const result = [].concat(a);
    b.forEach((item) => {
        const exist = result.find((element) => {
            return (compare ? compare(item, element) : Object.is(item, element));
        });
        if (!exist) {
            result.push(item);
        }
    });
    return result;
}

/**
 * This method pads the current string with another string (repeated, if needed)
 * so that the resulting string reaches the given length.
 * The padding is applied from the start (left) of the current string.
 * @argument {string} sourceString
 * @argument {string} targetLength
 * @argument {string} padString
 */
export function padStart(sourceString: string, targetLength: number, padString?: string): string {
    if (!sourceString) {
        return sourceString;
    }

    if (!(String.prototype as any).padStart) {
        // https://github.com/uxitten/polyfill/blob/master/string.polyfill.js
        padString = String(padString || " ");
        if (sourceString.length > targetLength) {
            return sourceString;
        } else {
            targetLength = targetLength - sourceString.length;
            if (targetLength > padString.length) {
                padString += padString.repeat(targetLength / padString.length); // append to original to ensure we are longer than needed
            }
            return padString.slice(0, targetLength) + sourceString;
        }
    } else {
        return (sourceString as any).padStart(targetLength, padString);
    }
}

export function parseConfigFile(fullFileName, filterComment: boolean = true): Map<string, string> {
    const result = new Map<string, string>();

    if (fileExistsSync(fullFileName)) {
        const rawText = fs.readFileSync(fullFileName, "utf8");
        const lines = rawText.split("\n");
        lines.forEach((line) => {
            if (line) {
                line = line.trim();
                if (filterComment) {
                    if (line.trim() && line.startsWith("#")) {
                        return;
                    }
                }
                const separator = line.indexOf("=");
                if (separator > 0) {
                    const key = line.substring(0, separator).trim();
                    const value = line.substring(separator + 1, line.length).trim();
                    result.set(key, value);
                }
            }
        });
    }
    return result;
}

export function getRegistryValues(hive: string, key: string, name: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const regKey = new WinReg({
                hive,
                key,
            });

            regKey.valueExists(name, (e, exists) => {
                if (e) {
                    return reject(e);
                }
                if (exists) {
                    regKey.get(name, (err, result) => {
                        if (!err) {
                            resolve(result ? result.value : "");
                        } else {
                            reject(err);
                        }
                    });
                } else {
                    resolve("");
                }
            });
        } catch (ex) {
            reject(ex);
        }
    });
}

export function convertToHex(number, width = 0) {
    return padStart(number.toString(16), width, "0");
}

/**
 * This will accept any Arduino*.app on Mac OS,
 * in case you named Arduino with a version number
 * @argument {string} arduinoPath
 */
export function resolveMacArduinoAppPath(arduinoPath: string, useArduinoCli = false): string {
    if (useArduinoCli || /Arduino.*\.app/.test(arduinoPath)) {
        return arduinoPath;
    } else {
        return path.join(arduinoPath, "Arduino.app");
    }
}
