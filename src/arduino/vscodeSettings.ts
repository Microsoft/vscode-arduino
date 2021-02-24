// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const configKeys = {
    ARDUINO_PATH: "arduino.path",
    ARDUINO_COMMAND_PATH: "arduino.commandPath",
    ADDITIONAL_URLS: "arduino.additionalUrls",
    LOG_LEVEL: "arduino.logLevel",
    CLEAR_OUTPUT_ON_START: "arduino.clearOutputOnBuild",
    AUTO_UPDATE_INDEX_FILES: "arduino.autoUpdateIndexFiles",
    ALLOW_PDE_FILETYPE: "arduino.allowPDEFiletype",
    ENABLE_USB_DETECTION: "arduino.enableUSBDetection",
    DISABLE_TESTING_OPEN: "arduino.disableTestingOpen",
    IGNORE_BOARDS: "arduino.ignoreBoards",
    SKIP_HEADER_PROVIDER: "arduino.skipHeaderProvider",
    DEFAULT_BAUD_RATE: "arduino.defaultBaudRate",
};

export interface IVscodeSettings {
    arduinoPath: string;
    commandPath: string;
    additionalUrls: string | string[];
    logLevel: string;
    clearOutputOnBuild: boolean;
    allowPDEFiletype: boolean;
    enableUSBDetection: boolean;
    disableTestingOpen: boolean;
    ignoreBoards: string[];
    skipHeaderProvider: boolean;
    defaultBaudRate: number;
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

    public get clearOutputOnBuild(): boolean {
        return this.getConfigValue<boolean>(configKeys.CLEAR_OUTPUT_ON_START);
    }

    public get allowPDEFiletype(): boolean {
        return this.getConfigValue<boolean>(configKeys.ALLOW_PDE_FILETYPE);
    }

    public get enableUSBDetection(): boolean {
        return this.getConfigValue<boolean>(configKeys.ENABLE_USB_DETECTION);
    }

    public get disableTestingOpen(): boolean {
        return this.getConfigValue<boolean>(configKeys.DISABLE_TESTING_OPEN);
    }

    public get ignoreBoards(): string[] {
        return this.getConfigValue<string[]>(configKeys.IGNORE_BOARDS);
    }

    public set ignoreBoards(value: string[]) {
        this.setConfigValue(configKeys.IGNORE_BOARDS, value, true);
    }

    public get defaultBaudRate(): number {
        return this.getConfigValue<number>(configKeys.DEFAULT_BAUD_RATE);
    }

    public get skipHeaderProvider(): boolean {
        return this.getConfigValue<boolean>(configKeys.SKIP_HEADER_PROVIDER);
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
