// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import * as WinReg from "winreg";
import * as util from "../common/util";

import { resolveArduinoPath, validateArduinoPath } from "../common/platform";

import { VscodeSettings } from "./vscodeSettings";

export interface IArduinoSettings {
    arduinoPath: string;
    commandPath: string;
    defaultExamplePath: string;
    packagePath: string;
    defaultPackagePath: string;
    defaultLibPath: string;
    sketchbookPath: string;
    preferencePath: string;
    defaultBaudRate: number;
    preferences: Map<string, string>;
    useArduinoCli: boolean;
    reloadPreferences(): void;
}

export class ArduinoSettings implements IArduinoSettings {
    private _arduinoPath: string;

    private _commandPath: string;

    private _packagePath: string;

    private _sketchbookPath: string;

    private _defaultBaudRate: number;

    private _preferences: Map<string, string>;

    private _useArduinoCli: boolean;

    public constructor() {
    }

    public async initialize() {
        const platform = os.platform();
        this._commandPath = VscodeSettings.getInstance().commandPath;
        this._useArduinoCli = VscodeSettings.getInstance().useArduinoCli;
        await this.tryResolveArduinoPath();
        await this.tryGetDefaultBaudRate();
        if (platform === "win32") {
            await this.updateWindowsPath();
            if (this._commandPath === "") {
                this._useArduinoCli ? this._commandPath = "arduino-cli.exe" : this._commandPath = "arduino_debug.exe";
            }
        } else if (platform === "linux") {
            if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
                this._packagePath = path.join(this._arduinoPath, "portable");
            } else {
                this._packagePath = path.join(process.env.HOME, ".arduino15");
            }

            if (this.preferences.get("sketchbook.path")) {
                if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
                    this._sketchbookPath = path.join(this._arduinoPath, "portable", this.preferences.get("sketchbook.path"));
                } else {
                    this._sketchbookPath = this.preferences.get("sketchbook.path");
                }
            } else {
                this._sketchbookPath = path.join(process.env.HOME, "Arduino");
            }

            if (this._commandPath === "" && !this._useArduinoCli) {
                this._commandPath = "arduino";
            }
        } else if (platform === "darwin") {
            if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
                this._packagePath = path.join(this._arduinoPath, "portable");
            } else {
                this._packagePath = path.join(process.env.HOME, "Library/Arduino15");
            }

            if (this.preferences.get("sketchbook.path")) {
                if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
                    this._sketchbookPath = path.join(this._arduinoPath, "portable", this.preferences.get("sketchbook.path"));
                } else {
                    this._sketchbookPath = this.preferences.get("sketchbook.path");
                }
            } else {
                this._sketchbookPath = path.join(process.env.HOME, "Documents/Arduino");
            }

            if (this._commandPath === "" && !this._useArduinoCli) {
                this._commandPath = "/Contents/MacOS/Arduino";
            }
        }
    }

    public get arduinoPath(): string {
        return this._arduinoPath;
    }

    public get defaultExamplePath(): string {
        if (os.platform() === "darwin") {
            return path.join(util.resolveMacArduinoAppPath(this._arduinoPath, this._useArduinoCli), "/Contents/Java/examples");
        } else {
            return path.join(this._arduinoPath, "examples");
        }
    }

    public get packagePath(): string {
        return this._packagePath;
    }

    public get defaultPackagePath(): string {
        if (os.platform() === "darwin") {
            return path.join(util.resolveMacArduinoAppPath(this._arduinoPath, this._useArduinoCli), "/Contents/Java/hardware");
        } else { // linux and win32.
            return path.join(this._arduinoPath, "hardware");
        }
    }

    public get defaultLibPath(): string {
        if (os.platform() === "darwin") {
            return path.join(util.resolveMacArduinoAppPath(this._arduinoPath, this._useArduinoCli), "/Contents/Java/libraries");
        } else { // linux and win32
            return path.join(this._arduinoPath, "libraries");
        }
    }

    public get commandPath(): string {
        const platform = os.platform();
        if (platform === "darwin") {
            return path.join(util.resolveMacArduinoAppPath(this._arduinoPath, this._useArduinoCli), path.normalize(this._commandPath));
        } else {
            return path.join(this._arduinoPath, path.normalize(this._commandPath));
        }
    }

    public get sketchbookPath() {
        return this._sketchbookPath;
    }

    public get preferencePath() {
        return path.join(this.packagePath, "preferences.txt");
    }

    public get preferences() {
        if (!this._preferences) {
            this._preferences = util.parseConfigFile(this.preferencePath);
        }
        return this._preferences;
    }

    public get useArduinoCli() {
        return this._useArduinoCli;
    }

    public get defaultBaudRate() {
        return this._defaultBaudRate;
    }

    public reloadPreferences() {
        this._preferences = util.parseConfigFile(this.preferencePath);
        if (this.preferences.get("sketchbook.path")) {
            if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
                this._sketchbookPath = path.join(this._arduinoPath, "portable", this.preferences.get("sketchbook.path"));
            } else {
                this._sketchbookPath = this.preferences.get("sketchbook.path");
            }
        }
    }

    /**
     * For Windows platform, there are two situations here:
     *  - User change the location of the default *Documents* folder.
     *  - Use the windows store Arduino app.
     */
    private async updateWindowsPath(): Promise<void> {
        let folder;
        try {
            folder = await util.getRegistryValues(WinReg.HKCU,
                "\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
                "Personal");
        } catch (ex) {
        }
        if (!folder) {
            folder = path.join(process.env.USERPROFILE, "Documents");
        }
        // For some case, docFolder parsed from win32 registry looks like "%USERPROFILE%\Documents,
        // Should replace the environment variables with actual value.
        folder = folder.replace(/%([^%]+)%/g, (match, p1) => {
            return process.env[p1];
        });
        if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
            this._packagePath = path.join(this._arduinoPath, "portable");
        } else if (util.fileExistsSync(path.join(this._arduinoPath, "AppxManifest.xml"))) {
            this._packagePath = path.join(folder, "ArduinoData");
        } else {
            this._packagePath = path.join(process.env.LOCALAPPDATA, "Arduino15");
        }

        if (this.preferences.get("sketchbook.path")) {
            if (util.directoryExistsSync(path.join(this._arduinoPath, "portable"))) {
                this._sketchbookPath = path.join(this._arduinoPath, "portable", this.preferences.get("sketchbook.path"));
            } else {
                this._sketchbookPath = this.preferences.get("sketchbook.path");
            }
        } else {
            this._sketchbookPath = path.join(folder, "Arduino");
        }
    }

    private async tryResolveArduinoPath(): Promise<void> {
        // Query arduino path sequentially from the following places such as "vscode user settings", "system environment variables",
        // "usual software installation directory for each os".
        // 1. Search vscode user settings first.
        const configValue = VscodeSettings.getInstance().arduinoPath;
        if (!configValue || !configValue.trim()) {
            // 2 & 3. Resolve arduino path from system environment variables and usual software installation directory.
            this._arduinoPath = await Promise.resolve(resolveArduinoPath());
        } else {
            this._arduinoPath = configValue;
        }
    }

    private async tryGetDefaultBaudRate(): Promise<void> {
        const supportBaudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000];
        const configValue = VscodeSettings.getInstance().defaultBaudRate;
        if (!configValue || supportBaudRates.indexOf(configValue) === -1) {
            this._defaultBaudRate = 0;
        } else {
            this._defaultBaudRate = configValue;
        }
    }
}
