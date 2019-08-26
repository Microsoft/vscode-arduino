// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";

export const ARDUINO_CONFIG_FILE = path.join(".vscode", "arduino.json");

export const CPP_CONFIG_FILE = path.join(".vscode", "c_cpp_properties.json");

export const ARDUINO_MODE: vscode.DocumentSelector = [
    { language: "cpp", scheme: "file" },
    { language: "arduino", scheme: "file" },
];

export const ARDUINO_MANAGER_PROTOCOL = "arduino-manager";
export const BOARD_MANAGER_URI = vscode.Uri.parse("arduino-manager://arduino/arduino-boardsmanager");
export const LIBRARY_MANAGER_URI = vscode.Uri.parse("arduino-manager://arduino/arduino-librariesmanager");
export const BOARD_CONFIG_URI = vscode.Uri.parse("arduino-manager://arduino/arduino-config");
export const EXAMPLES_URI = vscode.Uri.parse("arduino-manager://arduino/arduino-examples");
export const SERIAL_PLOTTER_URI = vscode.Uri.parse("arduino-manager://arduino/arduino-serialplotter");

export const messages = {
    ARDUINO_FILE_ERROR: "The arduino.json file format is not correct.",
    NO_BOARD_SELECTED: "Please select the board type first.",
    INVALID_ARDUINO_PATH: "Cannot find Arduino IDE. Please specify the \"arduino.path\" in the User Settings. Requires a restart after change.",
    INVALID_COMMAND_PATH: "Please check the \"arduino.commandPath\" in the User Settings." +
"Requires a restart after change.Cannot find the command file:",
    FAILED_SEND_SERIALPORT: "Failed to send message to serial port.",
    SERIAL_PORT_NOT_STARTED: "Serial Monitor has not been started.",
    SEND_BEFORE_OPEN_SERIALPORT: "Please open a serial port first.",
    NO_PROGRAMMMER_SELECTED: "Please select the programmer first.",
    INVALID_OUTPUT_PATH: "Please check the \"output\" in the sketch Settings.Cannot find the output path:",
};

export const statusBarPriority = {
    PORT: 20,
    OPEN_PORT: 30,
    BAUD_RATE: 40,
    OPEN_SERIAL_PLOTTER: 50,
    BOARD: 60,
    ENDING: 70,
    SKETCH: 80,
    PROGRAMMER: 90,
};
