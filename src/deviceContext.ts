// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as constants from "./common/constants";
import * as util from "./common/util";

import { ARDUINO_CONFIG_FILE } from "./common/constants";
import { ArduinoWorkspace } from "./common/workspace";
import { DeviceSettings } from "./deviceSettings"

/**
 * Interface that represents the arduino context information.
 * @interface
 */
export interface IDeviceContext {
    /**
     * COM Port connect to the device
     * @property {string}
     */
    port: string;

    /**
     * Current selected Arduino board alias.
     * @property {string}
     */
    board: string;

    /**
     * Arduino main sketch file
     * @property {string}
     */
    sketch: string;

    /**
     * Arduino build output path
     */

    output: string;
    /**
     * Arduino debugger
     */

    debugger_: string;

    /**
     * Current selected programmer.
     * @property {string}
     */
    programmer: string;

    /**
     * Arduino custom board configuration
     * @property {string}
     */
    configuration: string;

    /**
     * IntelliSense configuration auto-generation project override.
     */
    intelliSenseGen: string;

    initialize(): void;
}

export class DeviceContext implements IDeviceContext, vscode.Disposable {

    public static getInstance(): DeviceContext {
        return DeviceContext._deviceContext;
    }

    private static _deviceContext: DeviceContext = new DeviceContext();

    private _settings = new DeviceSettings();
    /**
     * TODO EW, 2020-02-17:
     * The absolute file path of the directory containing the vscode-arduino
     * extension. Not sure why this is stored here (it's a bit misplaced) and
     * not in a dedicated extension object containing the extension context
     * passed during activation. Another way would be a function in util.ts
     * using a mechanism like
     *
     *   path.normalize(path.join(path.dirname(__filename), ".."))
     */
    private _extensionPath: string;

    private _watcher: vscode.FileSystemWatcher;

    private _vscodeWatcher: vscode.FileSystemWatcher;

    private _sketchStatusBar: vscode.StatusBarItem;

    private _prebuild: string;

    private _programmer: string;

    private _suppressSaveContext: boolean = false;

    /**
     * @constructor
     */
    private constructor() {
        if (vscode.workspace && ArduinoWorkspace.rootPath) {
            this._watcher = vscode.workspace.createFileSystemWatcher(path.join(ArduinoWorkspace.rootPath, ARDUINO_CONFIG_FILE));
            // We only care about the deletion arduino.json in the .vscode folder:
            this._vscodeWatcher = vscode.workspace.createFileSystemWatcher(path.join(ArduinoWorkspace.rootPath, ".vscode"), true, true, false);

            this._watcher.onDidCreate(() => this.loadContext());
            this._watcher.onDidChange(() => this.loadContext());
            this._watcher.onDidDelete(() => this.loadContext());
            this._vscodeWatcher.onDidDelete(() => this.loadContext());
            this._sketchStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, constants.statusBarPriority.SKETCH);
            this._sketchStatusBar.command = "arduino.selectSketch";
            this._sketchStatusBar.tooltip = "Sketch File";
        }
    }

    public dispose() {
        if (this._watcher) {
            this._watcher.dispose();
        }
        if (this._vscodeWatcher) {
            this._vscodeWatcher.dispose();
        }
    }

    public get extensionPath(): string {
        return this._extensionPath;
    }

    public set extensionPath(value: string) {
        this._extensionPath = value;
    }

    /**
     * TODO: Current we use the Arduino default settings. For future release, this dependency might be removed
     * and the setting only depends on device.json.
     * @method
     *
     * TODO EW, 2020-02-18:
     * A problem I discovered: here you try to find the config file location
     * and when you're writing below, you use a hard-coded location. When
     * resorting to "find", you have to store the file's location at least and
     * reuse it when saving.
     * But I think the intention is: load a config file from anywhere and save
     * it under .vscode/arduino.json. But then the initial load has to use find
     * and afterwards it must not use find anymore.
     */
    public loadContext(): Thenable<object> {
        return vscode.workspace.findFiles(ARDUINO_CONFIG_FILE, null, 1)
            .then((files) => {
                if (files && files.length > 0) {
                    this._settings.load(files[0].fsPath);
                    // on invalid configuration we continue with current settings
                } else {
                    // No configuration file found, starting over with defaults
                    this._settings.reset();
                }
                return this;
            }, (reason) => {
                // Workaround for change in API.
                // vscode.workspace.findFiles() for some reason now throws an error ehn path does not exist
                // vscode.window.showErrorMessage(reason.toString());
                // Logger.notifyUserError("arduinoFileUnhandleError", new Error(reason.toString()));

                 // Workaround for change in API, populate required props for arduino.json
                this._settings.reset();
                return this;
            });
    }

    public showStatusBar() {
        if (!this._settings.sketch.value) {
            return false;
        }
        this._sketchStatusBar.text = this._settings.sketch.value;
        this._sketchStatusBar.show();
    }

    public get onChangePort() { return this._settings.port.emitter.event }
    public get onChangeBoard() { return this._settings.board.emitter.event }
    public get onChangeSketch() { return this._settings.sketch.emitter.event }
    public get onChangeOutput() { return this._settings.output.emitter.event }
    public get onChangeDebugger() { return this._settings.debugger.emitter.event }
    public get onChangeISAutoGen() { return this._settings.intelliSenseGen.emitter.event }
    public get onChangeConfiguration() { return this._settings.configuration.emitter.event }
    public get onChangePrebuild() { return this._settings.prebuild.emitter.event }
    public get onChangeSuccessfulbuild() { return this._settings.successfulbuild.emitter.event }
    public get onChangeFailedbuild() { return this._settings.failedbuild.emitter.event }
    public get onChangePostbuild() { return this._settings.postbuild.emitter.event }
    public get onChangeProgrammer() { return this._settings.programmer.emitter.event }

    public get port() {
        return this._settings.port.value;
    }

    public set port(value: string) {
        this._settings.port.value = value;
        this.saveContext();
    }

    public get board() {
        return this._settings.board.value;
    }

    public set board(value: string) {
        this._settings.board.value = value;
        this.saveContext();
    }

    public get sketch() {
        return this._settings.sketch.value;
    }

    public set sketch(value: string) {
        this._settings.sketch.value = value;
        this.saveContext();
    }

    public get prebuild() {
        return this._settings.prebuild.value;
    }

    public get successfulbuild() {
        return this._settings.successfulbuild.value;
    }

    public get failedbuild() {
        return this._settings.failedbuild.value;
    }

    public get postbuild() {
        return this._settings.postbuild.value;
    }

    public get output() {
        return this._settings.output.value;
    }

    public set output(value: string) {
        this._settings.output.value = value;
        this.saveContext();
    }

    public get debugger_() {
        return this._settings.debugger.value;
    }

    public set debugger_(value: string) {
        this._settings.debugger.value = value;
        this.saveContext();
    }

    public get intelliSenseGen() {
        return this._settings.intelliSenseGen.value;
    }

    public set intelliSenseGen(value: string) {
        this._settings.intelliSenseGen.value = value;
        this.saveContext();
    }

    public get configuration() {
        return this._settings.configuration.value;
    }

    public set configuration(value: string) {
        this._settings.configuration.value = value;
        this.saveContext();
    }

    public get programmer() {
        return this._settings.programmer.value;
    }

    public set programmer(value: string) {
        this._settings.programmer.value = value;
        this.saveContext();
    }

    public get suppressSaveContext() {
        return this._suppressSaveContext;
    }

    public set suppressSaveContext(value: boolean) {
        this._suppressSaveContext = value;
    }

    public get buildPreferences() {
        return this._settings.buildPreferences.value;
    }

    public async initialize() {
        if (ArduinoWorkspace.rootPath && util.fileExistsSync(path.join(ArduinoWorkspace.rootPath, ARDUINO_CONFIG_FILE))) {
            vscode.window.showInformationMessage("Arduino.json already generated.");
            return;
        } else {
            if (!ArduinoWorkspace.rootPath) {
                vscode.window.showInformationMessage("Please open a folder first.");
                return;
            }
            await this.resolveMainSketch();
            if (this.sketch) {
                await vscode.commands.executeCommand("arduino.changeBoardType");
                vscode.window.showInformationMessage("The workspace is initialized with the Arduino extension support.");
            } else {
                vscode.window.showInformationMessage("No sketch (*.ino or *.cpp) was found or selected - initialization skipped.");
            }
        }
    }

    /**
     * Note: We're using the class' setter for the sketch (i.e. this.sketch = ...)
     * to make sure that any changes are synched to the configuration file.
     */
    public async resolveMainSketch() {
        // TODO (EW, 2020-02-18): Here you look for *.ino files but below you allow
        //  *.cpp/*.c files to be set as sketch
        await vscode.workspace.findFiles("**/*.ino", null)
            .then(async (fileUris) => {
                if (fileUris.length === 0) {
                    let newSketchFileName = await vscode.window.showInputBox({
                        value: "my-sketch.ino",
                        prompt: "No sketch (*.ino) found in workspace, please provide a name",
                        placeHolder: "Sketch file name (*.ino or *.cpp)",
                        validateInput: (value) => {
                            /* TODO (EW, 2020-02-18):
                             * is 'c' actually allowed? Also found on within other files.
                             * And the regular expression doesn't need the internal groups.
                             * The outer group can be an anonymous group.
                             * And \w doesn't match dashes - so any sketch containing dashes
                             * will not be found.
                             * The correct expression therefore would be something like this:
                             *
                             *   /^[\w\-]+\.(?:ino|cpp)$/
                             *
                             * I'd recommend to define such regular expressions (including)
                             * line splitting etc.) at the global constants file.
                             * This is true for any hard coded paths (like the snippets below)
                             * as well.
                             */
                            if (value && /^\w+\.((ino)|(cpp)|c)$/.test(value.trim())) {
                                return null;
                            } else {
                                return "Invalid sketch file name. Should be *.ino/*.cpp/*.c";
                            }
                        },
                    });
                    newSketchFileName = (newSketchFileName && newSketchFileName.trim()) || "";
                    if (newSketchFileName) {
                        const snippets = fs.readFileSync(path.join(this.extensionPath, "snippets", "sample.ino"));
                        fs.writeFileSync(path.join(ArduinoWorkspace.rootPath, newSketchFileName), snippets);
                        this.sketch = newSketchFileName;
                        // Open the new sketch file.
                        const textDocument = await vscode.workspace.openTextDocument(path.join(ArduinoWorkspace.rootPath, newSketchFileName));
                        vscode.window.showTextDocument(textDocument, vscode.ViewColumn.One, true);
                    } else {
                        this.sketch = undefined;
                    }
                } else if (fileUris.length === 1) {
                    this.sketch = path.relative(ArduinoWorkspace.rootPath, fileUris[0].fsPath);
                } else if (fileUris.length > 1) {
                    const chosen = await vscode.window.showQuickPick(<vscode.QuickPickItem[]>fileUris.map((fileUri): vscode.QuickPickItem => {
                        return <vscode.QuickPickItem>{
                            label: path.relative(ArduinoWorkspace.rootPath, fileUri.fsPath),
                            description: fileUri.fsPath,
                        };
                    }), { placeHolder: "Select the main sketch file" });
                    if (chosen && chosen.label) {
                        this.sketch = chosen.label;
                    }
                }
            });
        return this.sketch;
    }

    private saveContext() {
        if (!ArduinoWorkspace.rootPath) {
            return;
        }
        const deviceConfigFile = path.join(ArduinoWorkspace.rootPath, ARDUINO_CONFIG_FILE);
        this._settings.save(deviceConfigFile);
    }
}
