// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as glob from "glob";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import * as constants from "../common/constants";
import * as util from "../common/util";
import * as Logger from "../logger/logger";

import { DeviceContext } from "../deviceContext";
import { IArduinoSettings } from "./arduinoSettings";
import { BoardManager } from "./boardManager";
import { ExampleManager } from "./exampleManager";
import { LibraryManager } from "./libraryManager";
import { VscodeSettings } from "./vscodeSettings";

import { arduinoChannel } from "../common/outputChannel";
import { ArduinoWorkspace } from "../common/workspace";
import { SerialMonitor } from "../serialmonitor/serialMonitor";
import { UsbDetector } from "../serialmonitor/usbDetector";
import { ProgrammerManager } from "./programmerManager";

/**
 * Represent an Arduino application based on the official Arduino IDE.
 */
export class ArduinoApp {

    private _boardManager: BoardManager;

    private _libraryManager: LibraryManager;

    private _exampleManager: ExampleManager;

    private _programmerManager: ProgrammerManager;

    /**
     * @param {IArduinoSettings} _settings ArduinoSetting object.
     */
    constructor(private _settings: IArduinoSettings) {
    }

    /**
     * Need refresh Arduino IDE's setting when starting up.
     * @param {boolean} force - Whether force initialize the arduino
     */
    public async initialize(force: boolean = false) {
        if (!util.fileExistsSync(this._settings.preferencePath)) {
            try {
                // Use empty pref value to initialize preference.txt file
                await this.setPref("boardsmanager.additional.urls", "");
                this._settings.reloadPreferences(); // reload preferences.
            } catch (ex) {
            }
        }
        if (force || !util.fileExistsSync(path.join(this._settings.packagePath, "package_index.json"))) {
            try {
                // Use the dummy package to initialize the Arduino IDE
                await this.installBoard("dummy", "", "", true);
            } catch (ex) {
            }
        }
    }

    /**
     * Initialize the arduino library.
     * @param {boolean} force - Whether force refresh library index file
     */
    public async initializeLibrary(force: boolean = false) {
        if (force || !util.fileExistsSync(path.join(this._settings.packagePath, "library_index.json"))) {
            try {
                // Use the dummy library to initialize the Arduino IDE
                await this.installLibrary("dummy", "", true);
            } catch (ex) {
            }
        }
    }

    /**
     * Set the Arduino preferences value.
     * @param {string} key - The preference key
     * @param {string} value - The preference value
     */
    public async setPref(key, value) {
        try {
            await util.spawn(this._settings.commandPath,
                null,
                ["--pref", `${key}=${value}`, "--save-prefs"]);
        } catch (ex) {
        }
    }

    public async upload() {
        const dc = DeviceContext.getInstance();
        const boardDescriptor = this.getBoardBuildString();
        if (!boardDescriptor) {
            return;
        }

        if (!ArduinoWorkspace.rootPath) {
            vscode.window.showWarningMessage("Cannot find the sketch file.");
            return;
        }

        if (!dc.sketch || !util.fileExistsSync(path.join(ArduinoWorkspace.rootPath, dc.sketch))) {
            await this.getMainSketch(dc);
        }

        if ((!dc.configuration || !/upload_method=[^=,]*st[^,]*link/i.test(dc.configuration)) && !dc.port) {
            const choice = await vscode.window.showInformationMessage(
                "Serial port is not specified. Do you want to select a serial port for uploading?",
                "Yes", "No");
            if (choice === "Yes") {
                vscode.commands.executeCommand("arduino.selectSerialPort");
            }
            return;
        }

        arduinoChannel.show();
        if (VscodeSettings.getInstance().clearOutputOnBuild) {
            arduinoChannel.clear();
        }
        arduinoChannel.start(`Upload sketch - ${dc.sketch}`);

        const serialMonitor = SerialMonitor.getInstance();

        const needRestore = await serialMonitor.closeSerialMonitor(dc.port);
        UsbDetector.getInstance().pauseListening();
        await vscode.workspace.saveAll(false);

        if (dc.prebuild) {
            arduinoChannel.info(`Run prebuild command: ${dc.prebuild}`);
            const prebuildargs = dc.prebuild.split(" ");
            const prebuildCommand = prebuildargs.shift();
            try {
                await util.spawn(prebuildCommand, arduinoChannel.channel, prebuildargs, { shell: true, cwd: ArduinoWorkspace.rootPath });
            } catch (ex) {
                arduinoChannel.error(`Run prebuild failed: \n${ex.error}`);
                return;
            }
        }

        const appPath = path.join(ArduinoWorkspace.rootPath, dc.sketch);
        const args = ["--upload", "--board", boardDescriptor];
        if (dc.port) {
            args.push("--port", dc.port);
        }
        args.push(appPath);
        if (VscodeSettings.getInstance().logLevel === "verbose") {
            args.push("--verbose");
        }
        if (dc.output) {
            const outputPath = path.resolve(ArduinoWorkspace.rootPath, dc.output);
            const dirPath = path.dirname(outputPath);
            if (!util.directoryExistsSync(dirPath)) {
                Logger.notifyUserError("InvalidOutPutPath", new Error(constants.messages.INVALID_OUTPUT_PATH + outputPath));
                return;
            }

            args.push("--pref", `build.path=${outputPath}`);
            arduinoChannel.info(`Please see the build logs in Output path: ${outputPath}`);
        } else {
            const msg = "Output path is not specified. Unable to reuse previously compiled files. Upload could be slow. See README.";
            arduinoChannel.warning(msg);
        }
        await util.spawn(this._settings.commandPath, arduinoChannel.channel, args).then(async () => {
            UsbDetector.getInstance().resumeListening();
            if (needRestore) {
                await serialMonitor.openSerialMonitor();
            }
            arduinoChannel.end(`Uploaded the sketch: ${dc.sketch}${os.EOL}`);
        }, (reason) => {
            arduinoChannel.error(`Exit with code=${reason.code}${os.EOL}`);
        });
    }

    public async uploadUsingProgrammer() {
        const dc = DeviceContext.getInstance();
        const boardDescriptor = this.getBoardBuildString();
        if (!boardDescriptor) {
            return;
        }

        const selectProgrammer = this.getProgrammerString();
        if (!selectProgrammer) {
            return;
        }

        if (!ArduinoWorkspace.rootPath) {
            vscode.window.showWarningMessage("Cannot find the sketch file.");
            return;
        }

        if (!dc.sketch || !util.fileExistsSync(path.join(ArduinoWorkspace.rootPath, dc.sketch))) {
            await this.getMainSketch(dc);
        }
        if (!dc.port) {
            const choice = await vscode.window.showInformationMessage(
                "Serial port is not specified. Do you want to select a serial port for uploading?",
                "Yes", "No");
            if (choice === "Yes") {
                vscode.commands.executeCommand("arduino.selectSerialPort");
            }
            return;
        }

        arduinoChannel.show();
        if (VscodeSettings.getInstance().clearOutputOnBuild) {
            arduinoChannel.clear();
        }
        arduinoChannel.start(`Upload sketch - ${dc.sketch}`);

        const serialMonitor = SerialMonitor.getInstance();

        const needRestore = await serialMonitor.closeSerialMonitor(dc.port);
        UsbDetector.getInstance().pauseListening();
        await vscode.workspace.saveAll(false);

        const appPath = path.join(ArduinoWorkspace.rootPath, dc.sketch);
        const args = ["--upload", "--board", boardDescriptor, "--port", dc.port, "--useprogrammer",
            "--pref", "programmer=" + selectProgrammer, appPath];
        if (VscodeSettings.getInstance().logLevel === "verbose") {
            args.push("--verbose");
        }
        if (dc.output) {
            const outputPath = path.resolve(ArduinoWorkspace.rootPath, dc.output);
            const dirPath = path.dirname(outputPath);
            if (!util.directoryExistsSync(dirPath)) {
                Logger.notifyUserError("InvalidOutPutPath", new Error(constants.messages.INVALID_OUTPUT_PATH + outputPath));
                return;
            }

            args.push("--pref", `build.path=${outputPath}`);
            arduinoChannel.info(`Please see the build logs in Output path: ${outputPath}`);
        } else {
            const msg = "Output path is not specified. Unable to reuse previously compiled files. Upload could be slow. See README.";
            arduinoChannel.warning(msg);
        }
        await util.spawn(this._settings.commandPath, arduinoChannel.channel, args).then(async () => {
            UsbDetector.getInstance().resumeListening();
            if (needRestore) {
                await serialMonitor.openSerialMonitor();
            }
            arduinoChannel.end(`Uploaded the sketch: ${dc.sketch}${os.EOL}`);
        }, (reason) => {
            arduinoChannel.error(`Exit with code=${reason.code}${os.EOL}`);
        });
    }

    public async verify(output: string = "") {
        const dc = DeviceContext.getInstance();
        const boardDescriptor = this.getBoardBuildString();
        if (!boardDescriptor) {
            return;
        }

        if (!ArduinoWorkspace.rootPath) {
            vscode.window.showWarningMessage("Cannot find the sketch file.");
            return;
        }

        if (!dc.sketch || !util.fileExistsSync(path.join(ArduinoWorkspace.rootPath, dc.sketch))) {
            await this.getMainSketch(dc);
        }

        await vscode.workspace.saveAll(false);

        if (VscodeSettings.getInstance().clearOutputOnBuild) {
            arduinoChannel.clear();
        }
        arduinoChannel.start(`Verify sketch - ${dc.sketch}`);

        if (dc.prebuild) {
            arduinoChannel.info(`Run prebuild command: ${dc.prebuild}`);
            const prebuildargs = dc.prebuild.split(" ");
            const prebuildCommand = prebuildargs.shift();
            try {
                await util.spawn(prebuildCommand, arduinoChannel.channel, prebuildargs, { shell: true, cwd: ArduinoWorkspace.rootPath });
            } catch (ex) {
                arduinoChannel.error(`Run prebuild failed: \n${ex.error}`);
                return;
            }
        }

        const appPath = path.join(ArduinoWorkspace.rootPath, dc.sketch);
        const args = ["--verify", "--board", boardDescriptor, appPath];
        if (VscodeSettings.getInstance().logLevel === "verbose") {
            args.push("--verbose");
        }
        if (output || dc.output) {
            const outputPath = path.resolve(ArduinoWorkspace.rootPath, output || dc.output);
            const dirPath = path.dirname(outputPath);
            if (!util.directoryExistsSync(dirPath)) {
                Logger.notifyUserError("InvalidOutPutPath", new Error(constants.messages.INVALID_OUTPUT_PATH + outputPath));
                return;
            }

            args.push("--pref", `build.path=${outputPath}`);
            arduinoChannel.info(`Please see the build logs in Output path: ${outputPath}`);
        } else {
            const msg = "Output path is not specified. Unable to reuse previously compiled files. Verify could be slow. See README.";
            arduinoChannel.warning(msg);
        }

        arduinoChannel.show();
        // we need to return the result of verify
        try {
            await util.spawn(this._settings.commandPath, arduinoChannel.channel, args);
            arduinoChannel.end(`Finished verify sketch - ${dc.sketch}${os.EOL}`);
            return true;
        } catch (reason) {
            const msg = reason.code ?
                `Exit with code=${reason.code}${os.EOL}` :
                reason.message ?
                    reason.message :
                    JSON.stringify(reason);
            arduinoChannel.error(msg);
            return false;
        }

    }

    public tryToUpdateIncludePaths() {
        const configFilePath = path.join(ArduinoWorkspace.rootPath, constants.CPP_CONFIG_FILE);
        if (!fs.existsSync(configFilePath)) {
            return;
        }
        const cppConfigFile = fs.readFileSync(configFilePath, "utf8");
        const cppConfig = JSON.parse(cppConfigFile) as { configurations: Array<{
            includePath: string[],
            forcedInclude: string[],
            defines: string[],
        }> };
        const libPaths = this.getDefaultPackageLibPaths();
        const defaultForcedInclude = this.getDefaultForcedIncludeFiles();
        const defines = this.getDefaultDefines();
        const configuration = cppConfig.configurations[0];

        let cppConfigFileUpdated = false;
        // cpp extension changes \\ to \\\\ in paths in JSON string, revert them first
        configuration.includePath = configuration.includePath.map((path) => path.replace(/\\\\/g, "\\"));
        configuration.forcedInclude = configuration.forcedInclude.map((path) => path.replace(/\\\\/g, "\\"));
        configuration.defines = configuration.defines.map((path) => path.replace(/\\\\/g, "\\"));

        for (const libPath of libPaths) {
            if (configuration.includePath.indexOf(libPath) === -1) {
                cppConfigFileUpdated = true;
                configuration.includePath.push(libPath);
            }
        }
        for (const forcedIncludePath of defaultForcedInclude) {
            if (configuration.forcedInclude.indexOf(forcedIncludePath) === -1) {
                cppConfigFileUpdated = true;
                configuration.forcedInclude.push(forcedIncludePath);
            }
        }

        for (const define of defines) {
            if (configuration.defines.indexOf(define) === -1) {
                cppConfigFileUpdated = true;
                configuration.defines.push(define);
            }
        }
        // remove all unexisting paths
        // concern mistake removal, comment temporary
        // for (let pathIndex = 0; pathIndex < configuration.includePath.length; pathIndex++) {
        //     let libPath = configuration.includePath[pathIndex];
        //     if (libPath.indexOf("${workspaceFolder}") !== -1) {
        //         continue;
        //     }
        //     if (/\*$/.test(libPath)) {
        //         libPath = libPath.match(/^[^\*]*/)[0];
        //     }
        //     if (!fs.existsSync(libPath)) {
        //         cppConfigFileUpdated = true;
        //         configuration.includePath.splice(pathIndex, 1);
        //         pathIndex--;
        //     }
        // }
        // for (let pathIndex = 0; pathIndex < configuration.forcedInclude.length; pathIndex++) {
        //     const forcedIncludePath = configuration.forcedInclude[pathIndex];
        //     if (forcedIncludePath.indexOf("${workspaceFolder}") !== -1) {
        //         continue;
        //     }
        //     if (!fs.existsSync(forcedIncludePath)) {
        //         cppConfigFileUpdated = true;
        //         configuration.forcedInclude.splice(pathIndex, 1);
        //         pathIndex--;
        //     }
        // }

        if (cppConfigFileUpdated) {
            fs.writeFileSync(configFilePath, JSON.stringify(cppConfig, null, 4));
        }
    }

    // Add selected library path to the intellisense search path.
    public addLibPath(libraryPath: string) {
        let libPaths;
        if (libraryPath) {
            libPaths = [libraryPath];
        } else {
            libPaths = this.getDefaultPackageLibPaths();
        }

        const defaultForcedInclude = this.getDefaultForcedIncludeFiles();
        const defaultDefines = this.getDefaultDefines();

        if (!ArduinoWorkspace.rootPath) {
            return;
        }
        const configFilePath = path.join(ArduinoWorkspace.rootPath, constants.CPP_CONFIG_FILE);
        let deviceContext = null;
        if (!util.fileExistsSync(configFilePath)) {
            util.mkdirRecursivelySync(path.dirname(configFilePath));
            deviceContext = {};
        } else {
            deviceContext = util.tryParseJSON(fs.readFileSync(configFilePath, "utf8"));
        }
        if (!deviceContext) {
            Logger.notifyAndThrowUserError("arduinoFileError", new Error(constants.messages.ARDUINO_FILE_ERROR));
        }

        deviceContext.configurations = deviceContext.configurations || [];
        let configSection = null;
        deviceContext.configurations.forEach((section) => {
            if (section.name === util.getCppConfigPlatform()) {
                configSection = section;
            }
        });

        if (!configSection) {
            configSection = {
                name: util.getCppConfigPlatform(),
                includePath: [],
            };
            deviceContext.configurations.push(configSection);
        }

        libPaths.forEach((childLibPath) => {
            childLibPath = path.resolve(path.normalize(childLibPath));
            if (configSection.includePath && configSection.includePath.length) {
                for (const existingPath of configSection.includePath) {
                    if (childLibPath === path.resolve(path.normalize(existingPath))) {
                        return;
                    }
                }
            } else {
                configSection.includePath = [];
            }
            configSection.includePath.unshift(childLibPath);
        });

        if (!configSection.forcedInclude) {
            configSection.forcedInclude = defaultForcedInclude;
        } else {
            for (let i = 0; i < configSection.forcedInclude.length; i++) {
                if (/arduino\.h$/i.test(configSection.forcedInclude[i])) {
                    configSection.forcedInclude.splice(i, 1);
                    i--;
                }
            }
            configSection.forcedInclude = defaultForcedInclude.concat(configSection.forcedInclude);
        }

        if (!configSection.defines) {
            configSection.defines = defaultDefines;
        }

        fs.writeFileSync(configFilePath, JSON.stringify(deviceContext, null, 4));
    }

    // Include the *.h header files from selected library to the arduino sketch.
    public async includeLibrary(libraryPath: string) {
        if (!ArduinoWorkspace.rootPath) {
            return;
        }
        const dc = DeviceContext.getInstance();
        const appPath = path.join(ArduinoWorkspace.rootPath, dc.sketch);
        if (util.fileExistsSync(appPath)) {
            const hFiles = glob.sync(`${libraryPath}/*.h`, {
                nodir: true,
                matchBase: true,
            });
            const hIncludes = hFiles.map((hFile) => {
                return `#include <${path.basename(hFile)}>`;
            }).join(os.EOL);

            // Open the sketch and bring up it to current visible view.
            const textDocument = await vscode.workspace.openTextDocument(appPath);
            await vscode.window.showTextDocument(textDocument, vscode.ViewColumn.One, true);
            const activeEditor = vscode.window.visibleTextEditors.find((textEditor) => {
                return path.resolve(textEditor.document.fileName) === path.resolve(appPath);
            });
            if (activeEditor) {
                // Insert *.h at the beginning of the sketch code.
                await activeEditor.edit((editBuilder) => {
                    editBuilder.insert(new vscode.Position(0, 0), `${hIncludes}${os.EOL}${os.EOL}`);
                });
            }
        }
    }

    /**
     * Install arduino board package based on package name and platform hardware architecture.
     */
    public async installBoard(packageName: string, arch: string = "", version: string = "", showOutput: boolean = true) {
        arduinoChannel.show();
        const updatingIndex = packageName === "dummy" && !arch && !version;
        if (updatingIndex) {
            arduinoChannel.start(`Update package index files...`);
        } else {
            try {
                const packagePath = path.join(this._settings.packagePath, "packages", packageName);
                if (util.directoryExistsSync(packagePath)) {
                    util.rmdirRecursivelySync(packagePath);
                }
                arduinoChannel.start(`Install package - ${packageName}...`);
            } catch (error) {
                arduinoChannel.start(`Install package - ${packageName} failed under directory : ${error.path}${os.EOL}
Please make sure the folder is not occupied by other procedures .`);
                arduinoChannel.error(`Error message - ${error.message}${os.EOL}`);
                arduinoChannel.error(`Exit with code=${error.code}${os.EOL}`);
                return;
            }
        }
        try {
            await util.spawn(this._settings.commandPath,
                showOutput ? arduinoChannel.channel : null,
                ["--install-boards", `${packageName}${arch && ":" + arch}${version && ":" + version}`]);

            if (updatingIndex) {
                arduinoChannel.end("Updated package index files.");
            } else {
                arduinoChannel.end(`Installed board package - ${packageName}${os.EOL}`);
            }
        } catch (error) {
            // If a platform with the same version is already installed, nothing is installed and program exits with exit code 1
            if (error.code === 1) {
                if (updatingIndex) {
                    arduinoChannel.end("Updated package index files.");
                } else {
                    arduinoChannel.end(`Installed board package - ${packageName}${os.EOL}`);
                }
            } else {
                arduinoChannel.error(`Exit with code=${error.code}${os.EOL}`);
            }
        }
    }

    public uninstallBoard(boardName: string, packagePath: string) {
        arduinoChannel.start(`Uninstall board package - ${boardName}...`);
        util.rmdirRecursivelySync(packagePath);
        arduinoChannel.end(`Uninstalled board package - ${boardName}${os.EOL}`);
    }

    public async installLibrary(libName: string, version: string = "", showOutput: boolean = true) {
        arduinoChannel.show();
        const updatingIndex = (libName === "dummy" && !version);
        if (updatingIndex) {
            arduinoChannel.start("Update library index files...");
        } else {
            arduinoChannel.start(`Install library - ${libName}`);
        }
        try {
            await util.spawn(this._settings.commandPath,
                showOutput ? arduinoChannel.channel : null,
                ["--install-library", `${libName}${version && ":" + version}`]);

            if (updatingIndex) {
                arduinoChannel.end("Updated library index files.");
            } else {
                arduinoChannel.end(`Installed library - ${libName}${os.EOL}`);
            }
        } catch (error) {
            // If a library with the same version is already installed, nothing is installed and program exits with exit code 1
            if (error.code === 1) {
                if (updatingIndex) {
                    arduinoChannel.end("Updated library index files.");
                } else {
                    arduinoChannel.end(`Installed library - ${libName}${os.EOL}`);
                }
            } else {
                arduinoChannel.error(`Exit with code=${error.code}${os.EOL}`);
            }
        }
    }

    public uninstallLibrary(libName: string, libPath: string) {
        arduinoChannel.start(`Remove library - ${libName}`);
        util.rmdirRecursivelySync(libPath);
        arduinoChannel.end(`Removed library - ${libName}${os.EOL}`);
    }

    public getDefaultPackageLibPaths(): string[] {
        const result = [];
        const boardDescriptor = this._boardManager.currentBoard;
        if (!boardDescriptor) {
            return result;
        }
        const toolsPath = boardDescriptor.platform.rootBoardPath;
        result.push(path.normalize(path.join(toolsPath, "**")));
        const hardwareToolPath = path.join(toolsPath, "..", "..", "tools");
        if (fs.existsSync(hardwareToolPath)) {
            result.push(path.normalize(path.join(hardwareToolPath, "**")));
        }

        // Add default libraries to include path
        result.push(path.normalize(path.join(this._settings.defaultLibPath, "**")));

        const userLibsPath = (path.join(this._settings.sketchbookPath, "libraries", "**"));
        result.push(userLibsPath);
        // if (util.directoryExistsSync(path.join(toolsPath, "cores"))) {
        //     const coreLibs = fs.readdirSync(path.join(toolsPath, "cores"));
        //     if (coreLibs && coreLibs.length > 0) {
        //         coreLibs.forEach((coreLib) => {
        //             result.push(path.normalize(path.join(toolsPath, "cores", coreLib)));
        //         });
        //     }
        // }
        // return result;

        // <package>/hardware/<platform>/<version> -> <package>/tools
        const toolPath = path.join(toolsPath, "..", "..", "..", "tools");
        if (fs.existsSync(toolPath)) {
            result.push(path.normalize(path.join(toolPath, "**")));
        }
        return result;
    }

    public getDefaultForcedIncludeFiles(): string[] {
        const result = [];
        const boardDescriptor = this._boardManager.currentBoard;
        if (!boardDescriptor) {
            return result;
        }
        const arduinoHeadFilePath = path.normalize(path.join(boardDescriptor.platform.rootBoardPath, "cores", "arduino", "Arduino.h"));
        if (fs.existsSync(arduinoHeadFilePath)) {
            result.push(arduinoHeadFilePath);
        }
        return result;
    }

    public getDefaultDefines(): string[] {
        const result = [];
        // USBCON is required in order for Serial to be recognized by intellisense
        result.push("USBCON");
        return result;
    }

    public openExample(example) {
        function tmpName(name) {
            let counter = 0;
            let candidateName = name;
            while (true) {
                if (!util.fileExistsSync(candidateName) && !util.directoryExistsSync(candidateName)) {
                    return candidateName;
                }
                counter++;
                candidateName = `${name}_${counter}`;
            }
        }

        // Step 1: Copy the example project to a temporary directory.
        const sketchPath = path.join(this._settings.sketchbookPath, "generated_examples");
        if (!util.directoryExistsSync(sketchPath)) {
            util.mkdirRecursivelySync(sketchPath);
        }
        let destExample = "";
        if (util.directoryExistsSync(example)) {
            destExample = tmpName(path.join(sketchPath, path.basename(example)));
            util.cp(example, destExample);
        } else if (util.fileExistsSync(example)) {
            const exampleName = path.basename(example, path.extname(example));
            destExample = tmpName(path.join(sketchPath, exampleName));
            util.mkdirRecursivelySync(destExample);
            util.cp(example, path.join(destExample, path.basename(example)));
        }
        if (destExample) {
            // Step 2: Scaffold the example project to an arduino project.
            const items = fs.readdirSync(destExample);
            const sketchFile = items.find((item) => {
                return util.isArduinoFile(path.join(destExample, item));
            });
            if (sketchFile) {
                // Generate arduino.json
                const dc = DeviceContext.getInstance();
                const arduinoJson = {
                    sketch: sketchFile,
                    port: dc.port || "COM1",
                    board: dc.board,
                    configuration: dc.configuration,
                };
                const arduinoConfigFilePath = path.join(destExample, constants.ARDUINO_CONFIG_FILE);
                util.mkdirRecursivelySync(path.dirname(arduinoConfigFilePath));
                fs.writeFileSync(arduinoConfigFilePath, JSON.stringify(arduinoJson, null, 4));

                // Generate cpptools intellisense config
                const cppConfigFilePath = path.join(destExample, constants.CPP_CONFIG_FILE);

                // Current workspace
                let includePath = ["${workspaceRoot}"];
                // Defaut package for this board
                const defaultPackageLibPaths = this.getDefaultPackageLibPaths();
                includePath = includePath.concat(defaultPackageLibPaths);
                // Arduino built-in package tools
                includePath.push(path.join(this._settings.arduinoPath, "hardware", "tools", "**"));
                // Arduino built-in libraries
                includePath.push(path.join(this._settings.arduinoPath, "libraries", "**"));
                // Arduino custom package tools
                includePath.push(path.join(this._settings.sketchbookPath, "hardware", "tools", "**"));
                // Arduino custom libraries
                includePath.push(path.join(this._settings.sketchbookPath, "libraries", "**"));

                const forcedInclude = this.getDefaultForcedIncludeFiles();

                const defines = [
                    "ARDUINO=10800",
                ];
                const cppConfig = {
                    configurations: [{
                        name: util.getCppConfigPlatform(),
                        defines,
                        includePath,
                        forcedInclude,
                        intelliSenseMode: "clang-x64",
                        cStandard: "c11",
                        cppStandard: "c++17",
                    }],
                    version: 3,
                };
                util.mkdirRecursivelySync(path.dirname(cppConfigFilePath));
                fs.writeFileSync(cppConfigFilePath, JSON.stringify(cppConfig, null, 4));
            }

            // Step 3: Open the arduino project at a new vscode window.
            vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(destExample), true);
        }
        return destExample;
    }

    public get settings() {
        return this._settings;
    }

    public get boardManager() {
        return this._boardManager;
    }

    public set boardManager(value: BoardManager) {
        this._boardManager = value;
    }

    public get libraryManager() {
        return this._libraryManager;
    }

    public set libraryManager(value: LibraryManager) {
        this._libraryManager = value;
    }

    public get exampleManager() {
        return this._exampleManager;
    }

    public set exampleManager(value: ExampleManager) {
        this._exampleManager = value;
    }

    public get programmerManager() {
        return this._programmerManager;
    }

    public set programmerManager(value: ProgrammerManager) {
        this._programmerManager = value;
    }

    private getProgrammerString(): string {
        const selectProgrammer = this.programmerManager.currentProgrammer;
        if (!selectProgrammer) {
            Logger.notifyUserError("getProgrammerString", new Error(constants.messages.NO_PROGRAMMMER_SELECTED));
            return;
        }
        return selectProgrammer;
    }

    private getBoardBuildString(): string {
        const selectedBoard = this.boardManager.currentBoard;
        if (!selectedBoard) {
            Logger.notifyUserError("getBoardBuildString", new Error(constants.messages.NO_BOARD_SELECTED));
            return;
        }
        return selectedBoard.getBuildConfig();
    }

    private async getMainSketch(dc: DeviceContext) {
        await dc.resolveMainSketch();
        if (!dc.sketch) {
            vscode.window.showErrorMessage("No sketch file was found. Please specify the sketch in the arduino.json file");
            throw new Error("No sketch file was found.");
        }
    }
}
