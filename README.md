# Visual Studio Code extension for Arduino

[![Gitter](https://img.shields.io/badge/chat-on%20gitter-blue.svg)](https://gitter.im/Microsoft/vscode-arduino)
[![Travis CI](https://travis-ci.org/Microsoft/vscode-arduino.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-arduino)

Welcome to the Visual Studio Code extension for **Arduino** <sup>preview</sup> ! The Arduino extension makes it easy to develop, build, deploy and debug your Arduino sketches in Visual Studio Code, with a rich set of functionalities. These include:

* IntelliSense and syntax highlighting for Arduino sketches
* Verify and upload your sketches in Visual Studio Code
* Built-in board and library manager
* Built-in example list
* Built-in serial monitor
* Snippets for sketches
* Automatic Arduino project scaffolding
* Command Palette (<kbd>F1</kbd>) integration of frequently used commands (e.g. Verify, Upload...)
* Integrated Arduino Debugging <sup>New</sup>

## Prerequisites
The Arduino IDE is required. Please install it from the [download page](https://www.arduino.cc/en/main/software#download).
- The supported Arduino IDE versions are `1.6.x` and later.
- The Windows Store's version of the Arduino IDE is not supported because of the sandbox environment that the application runs in.
- *Note:* Arduino IDE `1.8.7` has some breaking changes, causing board package and library installation failures.

## Installation
Open VS Code and press <kbd>F1</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to open command palette, select **Install Extension** and type `vscode-arduino`.

Or launch VS Code Quick Open (<kbd>Ctrl</kbd> + <kbd>P</kbd>), paste the following command, and press enter.
```bash
ext install vscode-arduino
```

You can also install directly from the Marketplace within Visual Studio Code, searching for `Arduino`.

## Get Started
You can find code samples and tutorials each time that you connect a supported device. Alternatively you can visit our [IoT Developer Blog Space](https://devblogs.microsoft.com/iotdev/) or [Get Started Tutorials](https://docs.microsoft.com/azure/iot-hub/iot-hub-arduino-iot-devkit-az3166-get-started).

## Commands
This extension provides several commands in the Command Palette (<kbd>F1</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>) for working with `*.ino` files:

- **Arduino: Board Manager**: Manage packages for boards. You can add 3rd party Arduino board by configuring `Additional Board Manager URLs` in the board manager.
- **Arduino: Change Baud Rate**: Change the baud rate of the selected serial port.
- **Arduino: Change Board Type**: Change board type or platform.
- **Arduino: Close Serial Monitor**: Stop the serial monitor and release the serial port.
- **Arduino: Examples**: Show list of examples.
- **Arduino: Initialize**: Scaffold a VS Code project with an Arduino sketch.
- **Arduino: Library Manager**: Explore and manage libraries.
- **Arduino: Open Serial Monitor**: Open the serial monitor in the integrated output window.
- **Arduino: Select Serial Port**: Change the current serial port.
- **Arduino: Send Text to Serial Port**: Send a line of text via the current serial port.
- **Arduino: Upload**: Build sketch and upload to Arduino board.
- **Arduino: Upload Using Programmer**: Upload using an external programmer.
- **Arduino: Verify**: Build sketch.

## Keybindings
- **Arduino: Upload** <kbd>Alt</kbd> + <kbd>Cmd</kbd> + <kbd>U</kbd> *or* <kbd>Alt</kbd> + <kbd>Ctrl</kbd> + <kbd>U</kbd>
- **Arduino: Verify** <kbd>Alt</kbd> + <kbd>Cmd</kbd> + <kbd>R</kbd> *or* <kbd>Alt</kbd> + <kbd>Ctrl</kbd> + <kbd>R</kbd>

## Options
| Option | Description |
| --- | --- |
| `arduino.path`  | Path to Arduino, you can use a custom version of Arduino by modifying this setting to include the full path. Example: `C:\\Program Files\\Arduino` for Windows, `/Applications` for Mac, `/home/<username>/Downloads/arduino-1.8.1` for Linux. (Requires a restart after change). The default value is automatically detected from your Arduino IDE installation path. |
| `arduino.commandPath` | Path to an executable (or script) relative to `arduino.path`. The default value is `arduino_debug.exe` for windows,`Contents/MacOS/Arduino` for Mac and `arduino` for Linux, You also can use a custom launch script to run Arduino by modifying this setting. (Requires a restart after change) Example: `run-arduino.bat` for Windows, `Contents/MacOS/run-arduino.sh` for Mac and `bin/run-arduino.sh` for Linux. |
| `arduino.additionalUrls` | Additional Boards Manager URLs for 3rd party packages. You can have multiple URLs in one string with a comma(`,`) as separator, or have a string array. The default value is empty. |
| `arduino.logLevel` | CLI output log level. Could be info or verbose. The default value is `"info"`. |
| `arduino.clearOutputOnBuild` | Clear the output logs before uploading or verifying. |
| `arduino.allowPDEFiletype` | Allow the VSCode Arduino extension to open .pde files from pre-1.0.0 versions of Ardiuno. Note that this will break Processing code. Default value is `false`. | 
| `arduino.enableUSBDetection` | Enable/disable USB detection from the VSCode Arduino extension. The default value is `true`. When your device is plugged in to your computer, it will pop up a message "`Detected board ****, Would you like to switch to this board type`". After clicking the `Yes` button, it will automatically detect which serial port (COM) is connected a USB device. If your device does not support this feature, please provide us with the PID/VID of your device; the code format is defined in `misc/usbmapping.json`.To learn more about how to list the vid/pid, use the following tools: https://github.com/EmergingTechnologyAdvisors/node-serialport `npm install -g serialport` `serialport-list -f jsonline`|
| `arduino.disableTestingOpen` | Enable/disable automatic sending of a test message to the serial port for checking the open status. The default value is `false` (a test message will be sent). |
| `arduino.skipHeaderProvider` | Enable/disable the extension providing completion items for headers. This functionality is included in newer versions of the C++ extension. The default value is `false`.|
| `arduino.defaultBaudRate` | Default baud rate for the serial port monitor. The default value is 115200. Supported values are 300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400 and 250000 |

The following Visual Studio Code settings are available for the Arduino extension. These can be set in global user preferences <kbd>Ctrl</kbd> + <kbd>,</kbd> or workspace settings (`.vscode/settings.json`). The latter overrides the former.

```json
{
    "arduino.path": "C:/Program Files (x86)/Arduino",
    "arduino.commandPath": "arduino_debug.exe",
    "arduino.logLevel": "info",
    "arduino.allowPDEFiletype": false, 
    "arduino.enableUSBDetection": true,
    "arduino.disableTestingOpen": false,
    "arduino.skipHeaderProvider": false,
    "arduino.additionalUrls": [
        "https://raw.githubusercontent.com/VSChina/azureiotdevkit_tools/master/package_azureboard_index.json",
        "http://arduino.esp8266.com/stable/package_esp8266com_index.json"
    ],
    "arduino.defaultBaudRate": 115200
}
```
*Note:* You only need to set `arduino.path` in Visual Studio Code settings, other options are not required.

The following settings are as per sketch settings of the Arduino extension. You can find them in
`.vscode/arduino.json` under the workspace.

```json
{
    "sketch": "example.ino",
    "port": "COM5",
    "board": "adafruit:samd:adafruit_feather_m0",
    "output": "../build",
    "debugger": "jlink",
    "prebuild": "bash prebuild.sh"
}
```
- `sketch` - The main sketch file name of Arduino.
- `port` - Name of the serial port connected to the device. Can be set by the `Arduino: Select Serial Port` command. For Mac users could be "/dev/cu.wchusbserial1420".
- `board` - Currently selected Arduino board alias. Can be set by the `Arduino: Change Board Type` command. Also, you can find the board list there.
- `output` - Arduino build output path. If not set, Arduino will create a new temporary output folder each time, which means it cannot reuse the intermediate result of the previous build leading to long verify/upload time, so it is recommended to set the field. Arduino requires that the output path should not be the workspace itself or in a subfolder of the workspace, otherwise, it may not work correctly. By default, this option is not set. It's worth noting that the contents of this file could be deleted during the build process, so pick (or create) a directory that will not store files you want to keep.
- `debugger` - The short name of the debugger that will be used when the board itself does not have a debugger and there is more than one debugger available. You can find the list of debuggers [here](https://github.com/Microsoft/vscode-arduino/blob/master/misc/debuggerUsbMapping.json). By default, this option is not set.
- `prebuild` - External command before building the sketch file. You should only set one `prebuild` command. `command1 && command2` does not work. If you need to run multiple commands before the build, then create a script.

## Debugging Arduino Code <sup>preview</sup>
Before you start to debug your Arduino code, please read [this document](https://code.visualstudio.com/docs/editor/debugging) to learn about the basic mechanisms of debugging in Visual Studio Code. Also see [debugging for C++ in VSCode](https://code.visualstudio.com/docs/languages/cpp#_debugging) for further reference.

Make sure that your Arduino board can work with [STLink](http://www.st.com/en/development-tools/st-link-v2.html), [Jlink](https://www.segger.com/jlink-debug-probes.html) or [EDBG](http://www.atmel.com/webdoc/protocoldocs/ch01s01.html). The debugging support is currently fully tested with the following boards:
- [MXChip IoT Developer Kit - AZ3166](https://microsoft.github.io/azure-iot-developer-kit/)
- [Arduino M0 PRO](https://www.arduino.cc/en/Main/ArduinoBoardM0PRO)
- [Adafruit WICED WiFi Feather](https://www.adafruit.com/product/3056)
- [Adafruit Feather M0](https://www.adafruit.com/product/3010)
- Arduino Zero Pro

Steps to start debugging:
1. Plug in your board to your development machine properly. For those boards that do not have an on-board debugging chip, you need to use a STLink or JLink connector.
2. Go to the **Debug View** (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>). and set breakpoints in your source files.
3. Press <kbd>F5</kbd> to select your debugging environment.
4. When your breakpoint is hit, you can see variables and add expression(s) to watch on the Debug Side Bar.

> To learn more about how to debug Arduino code, visit our [team blog](https://blogs.msdn.microsoft.com/iotdev/2017/05/27/debug-your-arduino-code-with-visual-studio-code/).

## Change Log
See the [Change log](https://github.com/Microsoft/vscode-arduino/blob/master/CHANGELOG.md) for details about the changes in each version.

## Supported Operating Systems
Currently this extension supports the following operating systems:

- Windows 7 and later (32-bit and 64-bit)
- macOS 10.10 and later
- Ubuntu 16.04
  - The extension might work on other Linux distributions, as reported by other users, but without guarantee.

## Support
You can find the full list of issues on the [Issue Tracker](https://github.com/Microsoft/vscode-arduino/issues). You can submit a [bug or feature suggestion](https://github.com/Microsoft/vscode-arduino/issues/new), and participate in community driven [discussions](https://gitter.im/Microsoft/vscode-arduino).

## Development

Installation prerequisites:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (>= 6.5.0)
- [Npm](https://www.npmjs.com/) (>= 3.10.3)

To *run and develop*, do the following:
- `git clone https://github.com/microsoft/vscode-arduino`
- `cd vscode-arduino`
- Run `npm i`
- Run `npm i -g gulp`
- Open in Visual Studio Code (`code .`)
- Press <kbd>F5</kbd> to debug.

To *test*, press <kbd>F5</kbd> in VS Code with the "Launch Tests" debug configuration.

## Code of Conduct
This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct). For more information please see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/#howadopt) or contact opencode@microsoft.com with any additional questions or comments.

## Privacy Statement
The [Microsoft Enterprise and Developer Privacy Statement](https://www.microsoft.com/en-us/privacystatement/EnterpriseDev/default.aspx) describes the privacy statement of this software.

## License
This extension is licensed under the [MIT License](https://github.com/Microsoft/vscode-arduino/blob/master/LICENSE.txt). Please see the [Third Party Notice](https://github.com/Microsoft/vscode-arduino/blob/master/ThirdPartyNotices.txt) file for additional copyright notices and terms.

## Contact Us
If you would like to help build the best Arduino experience with VS Code, you can reach us directly at [gitter chat room](https://gitter.im/Microsoft/vscode-arduino).
