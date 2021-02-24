// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

export const arduinoChannel = {
    channel: vscode.window.createOutputChannel("Arduino"),

    start(message: string) {
        this.channel.appendLine(`[Starting] ${message}`);
    },

    end(message: string) {
        this.channel.appendLine(`[Done] ${message}`);
    },

    warning(message: string) {
        this.channel.appendLine(`[Warning] ${message}`);
    },

    error(message: string) {
        this.channel.appendLine(`[Error] ${message}`);
    },

    info(message: string) {
        this.channel.appendLine(message);
    },

    show() {
        this.channel.show();
    },

    hide() {
        this.channel.hide();
    },

    clear() {
        this.channel.clear();
    },
};
