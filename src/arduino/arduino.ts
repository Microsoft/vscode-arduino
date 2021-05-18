// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as glob from "glob";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import * as constants from "../common/constants";
import * as util from "../common/util";
import * as logger from "../logger/logger";

import { DeviceContext } from "../deviceContext";
import { IArduinoSettings } from "./arduinoSettings";
import { BoardManager } from "./boardManager";
import { ExampleManager } from "./exampleManager";
import { AnalysisManager,
         isCompilerParserEnabled,
         makeCompilerParserContext } from "./intellisense";
import { LibraryManager } from "./libraryManager";
import { VscodeSettings } from "./vscodeSettings";

import { arduinoChannel } from "../common/outputChannel";
import { ArduinoWorkspace } from "../common/workspace";
import { SerialMonitor } from "../serialmonitor/serialMonitor";
import { UsbDetector } from "../serialmonitor/usbDetector";
import { ProgrammerManager } from "./programmerManager";

/**
 * Supported build modes. For further explanation see the documentation
 * of ArduinoApp.build().
 * The strings are used for status reporting within the above function.
 */
export enum BuildMode {
    Verify = "Verifying",
    Analyze = "Analyzing",
    Upload = "Uploading",
    CliUpload = "Uploading using Arduino CLI",
    UploadProgrammer = "Uploading (programmer)",
    CliUploadProgrammer = "Uploading (programmer) using Arduino CLI",
};

/**
 * Represent an Arduino application based on the official Arduino IDE.
 */
export class ArduinoApp {

    private _boardManager: BoardManager;

    private _libraryManager: LibraryManager;

    private _exampleManager: ExampleManager;

    private _programmerManager: ProgrammerManager;

    /**
     * IntelliSense analysis manager.
     * Makes sure that analysis builds and regular builds go along
     * and that multiple subsequent analysis requests - as triggered
     * by board/board-configuration changes - are bundled to a single
     * analysis build run.
     */
    private _analysisManager: AnalysisManager;

    /**
     * Indicates if a build is currently in progress.
     * If so any call to this.build() will return false immediately.
     */
    private _building: boolean = false;

    /**
     * @param {IArduinoSettings} _settings ArduinoSetting object.
     */
    constructor(private _settings: IArduinoSettings) {
        const analysisDelayMs = 1000 * 3;
        this._analysisManager = new AnalysisManager(
            () => this._building,
            async () => { await this.build(BuildMode.Analyze); },
            analysisDelayMs);
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

        // set up event handling for IntelliSense analysis
        const requestAnalysis = async () => {
            if (isCompilerParserEnabled()) {
                await this._analysisManager.requestAnalysis();
            }
        };
        const dc = DeviceContext.getInstance();
        dc.onChangeBoard(requestAnalysis);
        dc.onChangeConfiguration(requestAnalysis);
        dc.onChangeSketch(requestAnalysis);
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
                             ["--pref", `${key}=${value}`, "--save-prefs"]);
        } catch (ex) {
        }
    }

    /**
     * Returns true if a build is currently in progress.
     */
    public get building() {
        return this._building;
    }

    /**
     * Runs the arduino builder to build/compile and - if necessary - upload
     * the current sketch.
     * @param buildMode Build mode.
     *  * BuildMode.Upload: Compile and upload
     *  * BuildMode.UploadProgrammer: Compile and upload using the user
     *     selectable programmer
     *  * BuildMode.Analyze: Compile, analyze the output and generate
     *     IntelliSense configuration from it.
     *  * BuildMode.Verify: Just compile.
     * All build modes except for BuildMode.Analyze run interactively, i.e. if
     * something is missing, it tries to query the user for the missing piece
     * of information (sketch, board, etc.). Analyze runs non interactively and
     * just returns false.
     * @param buildDir Override the build directory set by the project settings
     * with the given directory.
     * @returns true on success, false if
     *  * another build is currently in progress
     *  * board- or programmer-manager aren't initialized yet
     *  * or something went wrong during the build
     */
    public async build(buildMode: BuildMode, buildDir?: string) {

        if (!this._boardManager || !this._programmerManager || this._building) {
            return false;
        }

        this._building = true;

        return await this._build(buildMode, buildDir)
        .then((ret) => {
            this._building = false;
            return ret;
        })
        .catch((reason) => {
            this._building = false;
            logger.notifyUserError("ArduinoApp.build",
                                   reason,
                                   `Unhandled exception when cleaning up build "${buildMode}": ${JSON.stringify(reason)}`);
            return false;
        });
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
      * Installs arduino board package.
      * (If using the aduino CLI this installs the corrosponding core.)
      * @param {string} packageName - board vendor
      * @param {string} arch - board architecture
      * @param {string} version - version of board package or core to download
      * @param {boolean} [showOutput=true] - show raw output from command
      */
    public async installBoard(packageName: string, arch: string = "", version: string = "", showOutput: boolean = true) {
        arduinoChannel.show();
        const updatingIndex = packageName === "dummy" && !arch && !version;
        if (updatingIndex) {
            arduinoChannel.start(`Update package index files...`);
        } else {
            try {
                const packagePath = path.join(this._settings.packagePath, "packages", packageName, arch);
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
        arduinoChannel.info(`${packageName}${arch && ":" + arch}${version && ":" + version}`);
        try {
            if (this.useArduinoCli()) {
                await util.spawn(this._settings.commandPath,
                    ["core", "install", `${packageName}${arch && ":" + arch}${version && "@" + version}`],
                    undefined,
                    { channel: showOutput ? arduinoChannel.channel : null });
            } else {
                await util.spawn(this._settings.commandPath,
                    ["--install-boards", `${packageName}${arch && ":" + arch}${version && ":" + version}`],
                    undefined,
                    { channel: showOutput ? arduinoChannel.channel : null });
            }
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

    /**
     * Downloads or updates a library
     * @param {string} libName - name of the library to download
     * @param {string} version - version of library to download
     * @param {boolean} [showOutput=true] - show raw output from command
     */

    public async installLibrary(libName: string, version: string = "", showOutput: boolean = true) {
        arduinoChannel.show();
        const updatingIndex = (libName === "dummy" && !version);
        if (updatingIndex) {
            arduinoChannel.start("Update library index files...");
        } else {
            arduinoChannel.start(`Install library - ${libName}`);
        }
        try {
            if (this.useArduinoCli()) {
                await  util.spawn(this._settings.commandPath,
                    ["lib", "install", `${libName}${version && "@" + version}`],
                    undefined,
                    { channel: showOutput ? arduinoChannel.channel : undefined });
            } else {
                await util.spawn(this._settings.commandPath,
                    ["--install-library", `${libName}${version && ":" + version}`],
                    undefined,
                    { channel: showOutput ? arduinoChannel.channel : undefined });
            }
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
                    // TODO EW, 2020-02-18: COM1 is Windows specific - what about OSX and Linux users?
                    port: dc.port || "COM1",
                    board: dc.board,
                    configuration: dc.configuration,
                };
                const arduinoConfigFilePath = path.join(destExample, constants.ARDUINO_CONFIG_FILE);
                util.mkdirRecursivelySync(path.dirname(arduinoConfigFilePath));
                fs.writeFileSync(arduinoConfigFilePath, JSON.stringify(arduinoJson, null, 4));
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

    /**
     * Runs the pre or post build command.
     * Usually before one of
     *  * verify
     *  * upload
     *  * upload using programmer
     * @param dc Device context prepared during one of the above actions
     * @param what "pre" if the pre-build command should be run, "post" if the
     * post-build command should be run.
     * @returns True if successful, false on error.
     */
    protected async runPrePostBuildCommand(dc: DeviceContext,
                                           environment: any,
                                           what: "pre" | "success" | "failed" | "post"): Promise<boolean> {
        let cmdline;
        switch(what) {
            case "pre": {
                cmdline = dc.prebuild;
                break;
            } 
            case "success": {
                cmdline = dc.successfulbuild;
                break;
            }
            case "failed": {
                cmdline = dc.failedbuild;
                break;
            }
            case "post": {
                cmdline = dc.postbuild;
                break;
            }
            default: {
                break;
            }
        } 

        if (!cmdline) {
            return true; // Successfully done nothing.
        }

        arduinoChannel.info(`Running ${what}-build command: "${cmdline}"`);
        let cmd: string;
        let args: string[];
        // pre-/post-build commands feature full bash support on UNIX systems.
        // On Windows you have full cmd support.
        if (os.platform() === "win32") {
            args = [];
            cmd = cmdline;
        } else {
            args = ["-c", cmdline];
            cmd = "bash";
        }
        try {
            await util.spawn(cmd,
                                args,
                                {
                                    shell: os.platform() === "win32",
                                    cwd: ArduinoWorkspace.rootPath,
                                    env: {...environment},
                                },
                                { channel: arduinoChannel.channel });
        } catch (ex) {
            const msg = ex.error
                ? `${ex.error}`
                : ex.code
                    ? `Exit code = ${ex.code}`
                    : JSON.stringify(ex);
            arduinoChannel.error(`Running ${what}-build command failed: ${os.EOL}${msg}`);
            return false;
        }
        return true;
    }

    /**
     * Checks if the arduino cli is being used
     * @returns {bool} - true if arduino cli is being use
     */
    private useArduinoCli() {
        return this._settings.useArduinoCli;
        // return VscodeSettings.getInstance().useArduinoCli;
    }

    /**
     * Private implementation. Not to be called directly. The wrapper build()
     * manages the build state.
     * @param buildMode See build()
     * @param buildDir See build()
     * @see https://github.com/arduino/Arduino/blob/master/build/shared/manpage.adoc
     */
    private async _build(buildMode: BuildMode, buildDir?: string): Promise<boolean> {
        const dc = DeviceContext.getInstance();
        const args: string[] = [];
        let restoreSerialMonitor: boolean = false;
        const verbose = VscodeSettings.getInstance().logLevel === constants.LogLevel.Verbose;

        if (!this.boardManager.currentBoard) {
            if (buildMode !== BuildMode.Analyze) {
                logger.notifyUserError("boardManager.currentBoard", new Error(constants.messages.NO_BOARD_SELECTED));
            }
            return false;
        }
        const boardDescriptor = this.boardManager.currentBoard.getBuildConfig();

        if (this.useArduinoCli()) {
            args.push("-b", boardDescriptor);
        } else {
            args.push("--board", boardDescriptor);
        }

        if (!ArduinoWorkspace.rootPath) {
            vscode.window.showWarningMessage("Workspace doesn't seem to have a folder added to it yet.");
            return false;
        }

        if (!dc.sketch || !util.fileExistsSync(path.join(ArduinoWorkspace.rootPath, dc.sketch))) {
            if (buildMode === BuildMode.Analyze) {
                // Analyze runs non interactively
                return false;
            }
            if (!await dc.resolveMainSketch()) {
                vscode.window.showErrorMessage("No sketch file was found. Please specify the sketch in the arduino.json file");
                return false;
            }
        }

        const selectSerial = async () => {
            const choice = await vscode.window.showInformationMessage(
                "Serial port is not specified. Do you want to select a serial port for uploading?",
                "Yes", "No");
            if (choice === "Yes") {
                vscode.commands.executeCommand("arduino.selectSerialPort");
            }
        }

        if (buildMode === BuildMode.Upload) {
            if ((!dc.configuration || !/upload_method=[^=,]*st[^,]*link/i.test(dc.configuration)) && !dc.port) {
                await selectSerial();
                return false;
            }

            if (this.useArduinoCli()) {
                args.push("compile", "--upload");
            } else {
                args.push("--upload");
            }

            if (dc.port) {
                args.push("--port", dc.port);
            }
        } else if (buildMode === BuildMode.CliUpload) {
            if ((!dc.configuration || !/upload_method=[^=,]*st[^,]*link/i.test(dc.configuration)) && !dc.port) {
                await selectSerial();
                return false;
            }

            if (!this.useArduinoCli()) {
                arduinoChannel.error("This command is only available when using the Arduino CLI");
                return false;
            }

            args.push("upload");

            if (dc.port) {
                args.push("--port", dc.port);
            }
        } else if (buildMode === BuildMode.UploadProgrammer) {
            const programmer = this.programmerManager.currentProgrammer;
            if (!programmer) {
                logger.notifyUserError("programmerManager.currentProgrammer", new Error(constants.messages.NO_PROGRAMMMER_SELECTED));
                return false;
            }
            if (!dc.port) {
                await selectSerial();
                return false;
            }

            if (this.useArduinoCli()) {
                args.push("compile",
                    "--upload",
                    "--programmer", programmer);
            } else {
                args.push("--upload",
                    "--useprogrammer",
                    "--pref", `programmer=arduino:${programmer}`);
            }

            args.push("--port", dc.port);
            if (!this.useArduinoCli()) {
                args.push("--verify");
            }
        } else if (buildMode === BuildMode.CliUploadProgrammer) {
            const programmer = this.programmerManager.currentProgrammer;
            if (!programmer) {
                logger.notifyUserError("programmerManager.currentProgrammer", new Error(constants.messages.NO_PROGRAMMMER_SELECTED));
                return false;
            }
            if (!dc.port) {
                await selectSerial();
                return false;
            }
            if (!this.useArduinoCli()) {
                arduinoChannel.error("This command is only available when using the Arduino CLI");
                return false;
            }

            args.push("upload",
                "--programmer", programmer,
                "--port", dc.port);
        } else {
            if (this.useArduinoCli()) {
                args.unshift("compile");
            } else {
                args.push("--verify");
            }
        }

        if (dc.buildPreferences) {
            for (const pref of dc.buildPreferences) {
                // Note: BuildPrefSetting makes sure that each preference
                // value consists of exactly two items (key and value).
                args.push("--pref", `${pref[0]}=${pref[1]}`);
            }
        }

        // We always build verbosely but filter the output based on the settings

        this._settings.useArduinoCli ? args.push("--verbose") : args.push("--verbose-build");

        if (verbose && !this._settings.useArduinoCli) {
            args.push("--verbose-upload");
        }

        await vscode.workspace.saveAll(false);

        // we prepare the channel here since all following code will
        // or at leas can possibly output to it
        arduinoChannel.show();
        arduinoChannel.start(`${buildMode} sketch '${dc.sketch}'`);

        if (buildDir || dc.output) {
            // 2020-02-29, EW: This whole code appears a bit wonky to me.
            //   What if the user specifies an output directory "../builds/my project"
            buildDir = path.resolve(ArduinoWorkspace.rootPath, buildDir || dc.output);
            const dirPath = path.dirname(buildDir);
            if (!util.directoryExistsSync(dirPath)) {
                logger.notifyUserError("InvalidOutPutPath", new Error(constants.messages.INVALID_OUTPUT_PATH + buildDir));
                return false;
            }

            if (this.useArduinoCli()) {
                args.push("--build-path", buildDir);

            } else {
                args.push("--pref", `build.path=${buildDir}`);
            }

            arduinoChannel.info(`Please see the build logs in output path: ${buildDir}`);
        } else {
            const msg = "Output path is not specified. Unable to reuse previously compiled files. Build will be slower. See README.";
            arduinoChannel.warning(msg);
        }

        // Environment variables passed to pre- and post-build commands
        const env = {
            VSCA_BUILD_MODE: buildMode,
            VSCA_SKETCH: dc.sketch,
            VSCA_BOARD: boardDescriptor,
            VSCA_WORKSPACE_DIR: ArduinoWorkspace.rootPath,
            VSCA_LOG_LEVEL: verbose ? constants.LogLevel.Verbose : constants.LogLevel.Info,
        };
        if (dc.port) {
            env["VSCA_SERIAL"] = dc.port;
        }
        if (buildDir) {
            env["VSCA_BUILD_DIR"] = buildDir;
        }

        // TODO EW: What should we do with pre-/post build commands when running
        //   analysis? Some could use it to generate/manipulate code which could
        //   be a prerequisite for a successful build
        if (!await this.runPrePostBuildCommand(dc, env, "pre")) {
            return false;
        }

        // stop serial monitor when everything is prepared and good
        // what makes restoring of its previous state easier
        if (buildMode === BuildMode.Upload ||
            buildMode === BuildMode.UploadProgrammer ||
            buildMode === BuildMode.CliUpload ||
            buildMode === BuildMode.CliUploadProgrammer) {
            restoreSerialMonitor = await SerialMonitor.getInstance().closeSerialMonitor(dc.port);
            UsbDetector.getInstance().pauseListening();
        }

        // Push sketch as last argument
        args.push(path.join(ArduinoWorkspace.rootPath, dc.sketch));

        const cocopa = makeCompilerParserContext(dc);

        const cleanup = async (result: "ok" | "error") => {
            let ret = true;
            if (result === "ok") {
                ret = await this.runPrePostBuildCommand(dc, env, "success");
            } else {
                ret = await this.runPrePostBuildCommand(dc, env, "failed");
            }
            ret = await this.runPrePostBuildCommand(dc, env, "post");
            await cocopa.conclude();
            if (buildMode === BuildMode.Upload || buildMode === BuildMode.UploadProgrammer) {
                UsbDetector.getInstance().resumeListening();
                if (restoreSerialMonitor) {
                    await SerialMonitor.getInstance().openSerialMonitor();
                }
            }
            return ret;
        }
        const stdoutcb = (line: string) => {
            if (cocopa.callback) {
                cocopa.callback(line);
            }
            if (verbose) {
                arduinoChannel.channel.append(line);
            }
        }
        const stderrcb = (line: string) => {
            if (os.platform() === "win32") {
                line = line.trim();
                if (line.length <= 0) {
                    return;
                }
                line = line.replace(/(?:\r|\r\n|\n)+/g, os.EOL);
                line = `${line}${os.EOL}`;
            }
            if (!verbose) {
                // Don't spill log with spurious info from the backend. This
                // list could be fetched from a config file to accommodate
                // messages of unknown board packages, newer backend revisions
                const filters = [
                    /^Picked\sup\sJAVA_TOOL_OPTIONS:\s+/,
                    /^\d+\d+-\d+-\d+T\d+:\d+:\d+.\d+Z\s(?:INFO|WARN)\s/,
                    /^(?:DEBUG|TRACE|INFO)\s+/,
                ];
                for (const f of filters) {
                    if (line.match(f)) {
                        return;
                    }
                }
            }
            arduinoChannel.channel.append(line);
        }

        return await util.spawn(
            this._settings.commandPath,
            args,
            undefined,
            { /*channel: arduinoChannel.channel,*/ stdout: stdoutcb, stderr: stderrcb },
        ).then(async () => {
            const ret = await cleanup("ok");
            if (ret) {
                arduinoChannel.end(`${buildMode} sketch '${dc.sketch}'${os.EOL}`);
            }
            return ret;
        }, async (reason) => {
            await cleanup("error");
            const msg = reason.code
                ? `Exit with code=${reason.code}`
                : JSON.stringify(reason);
            arduinoChannel.error(`${buildMode} sketch '${dc.sketch}': ${msg}${os.EOL}`);
            return false;
        });
    }
}
