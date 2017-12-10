// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const configKeys = {
    ARDUINO_PATH: "arduino.path",
    ARDUINO_COMMAND_PATH: "arduino.commandPath",
    ADDITIONAL_URLS: "arduino.additionalUrls",
    LOG_LEVEL: "arduino.logLevel",
    AUTO_UPDATE_INDEX_FILES: "arduino.autoUpdateIndexFiles",
    ENABLE_USB_DETECTOIN: "arduino.enableUSBDetection",
};

export interface IVscodeSettings {
    arduinoPath: string;
    commandPath: string;
    additionalUrls: string | string[];
    logLevel: string;
    enableUSBDetection: boolean;
    updateAdditionalUrls(urls: string | string[]): void;
}

export class VscodeSettings implements IVscodeSettings {
    public static getInstance(): IVscodeSettings {
        if (!VscodeSettings._instance) {
            VscodeSettings._instance = new VscodeSettings();
        }
        return VscodeSettings._instance;
    }

    private static _instance: IVscodeSettings;
    private constructor() {
    }

    public get arduinoPath(): string {
        return this.getConfigValue<string>(configKeys.ARDUINO_PATH);
    }

    public get commandPath(): string {
        return this.getConfigValue<string>(configKeys.ARDUINO_COMMAND_PATH);
    }

    public get additionalUrls(): string | string[] {
        return this.getConfigValue<string | string[]>(configKeys.ADDITIONAL_URLS);
    }

    public get logLevel(): string {
        return this.getConfigValue<string>(configKeys.LOG_LEVEL) || "info";
    }

    public get enableUSBDetection(): boolean {
        return this.getConfigValue<boolean>(configKeys.ENABLE_USB_DETECTOIN);
    }

    public async updateAdditionalUrls(value) {
        await this.setConfigValue(configKeys.ADDITIONAL_URLS, value, true);
    }

    private getConfigValue<T>(key: string): T {
        const workspaceConfig = vscode.workspace.getConfiguration();
        return workspaceConfig.get<T>(key);
    }

    private async setConfigValue(key: string, value, global: boolean = true) {
        const workspaceConfig = vscode.workspace.getConfiguration();
        await workspaceConfig.update(key, value, global);
    }
}
